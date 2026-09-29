/**
 * Thin WebGL2 plumbing: programs, meshes, instancing, thick lines, a shadow map.
 * Attribute locations are fixed across every program (see shaders.ts), so any
 * mesh can be drawn by any program without re-binding.
 */

import type { MeshData } from "./geometry";
import type { Vec3 } from "./math";

/**
 * A hardware WebGL2 context, or null.
 *
 * KOC desktops include VDI/Citrix sessions whose GPU is emulated (WARP,
 * SwiftShader, llvmpipe). Measured here on SwiftShader: this page's scene ran
 * at 1.5 fps, and because WebGL's sync calls wait on the software rasteriser,
 * the page's own heading took 23 s to appear behind a 12 s long task. Even a
 * single still frame is not worth that. So a context the browser flags with a
 * major performance caveat is refused outright, and the caller draws its SVG
 * fallback instead.
 */
export function createContext(canvas: HTMLCanvasElement, attrs: WebGLContextAttributes): WebGL2RenderingContext | null {
  const gl = canvas.getContext("webgl2", { ...attrs, failIfMajorPerformanceCaveat: true });
  if (!gl) return null;
  // Some browsers honour the flag loosely; the renderer string is the backstop.
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|softpipe|basic render|warp|software/i.test(name)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  return gl;
}

export const LOC = { pos: 0, nrm: 1, aux: 2, m0: 3, m1: 4, m2: 5, m3: 6, col: 7 } as const;

export type Uniforms = Record<string, WebGLUniformLocation | null>;

export interface Program {
  prog: WebGLProgram;
  u: Uniforms;
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  }
  const u: Uniforms = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, "");
    u[name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, u };
}

export interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
  buffers: WebGLBuffer[];
  instanceBuffer?: WebGLBuffer;
  instances: number;
}

export function uploadMesh(gl: WebGL2RenderingContext, d: MeshData, instanced = false, dynamic = false): Mesh {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const usage = dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  const buf = (loc: number, data: Float32Array, size: number) => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  const buffers = [buf(LOC.pos, d.positions, 3), buf(LOC.nrm, d.normals, 3)];
  if (d.aux) buffers.push(buf(LOC.aux, d.aux, 1));
  const ib = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.indices, usage);
  buffers.push(ib);
  let instanceBuffer: WebGLBuffer | undefined;
  if (instanced) {
    instanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    // 16 floats of matrix + 4 of colour per instance.
    const stride = 20 * 4;
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(LOC.m0 + k);
      gl.vertexAttribPointer(LOC.m0 + k, 4, gl.FLOAT, false, stride, k * 16);
      gl.vertexAttribDivisor(LOC.m0 + k, 1);
    }
    gl.enableVertexAttribArray(LOC.col);
    gl.vertexAttribPointer(LOC.col, 4, gl.FLOAT, false, stride, 64);
    gl.vertexAttribDivisor(LOC.col, 1);
  }
  gl.bindVertexArray(null);
  return { vao, count: d.indices.length, buffers, instanceBuffer, instances: 0 };
}

/** Replace a dynamic mesh's vertex data (same topology). */
export function updateMesh(gl: WebGL2RenderingContext, m: Mesh, d: MeshData) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.buffers[0]);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.positions);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.buffers[1]);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.normals);
}

export function setInstances(gl: WebGL2RenderingContext, m: Mesh, data: Float32Array) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.instanceBuffer!);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  m.instances = data.length / 20;
}

export function draw(gl: WebGL2RenderingContext, m: Mesh) {
  gl.bindVertexArray(m.vao);
  if (m.instanceBuffer) {
    if (m.instances > 0) gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, m.instances);
  } else {
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
  }
}

/** For a non-instanced draw through an instanced program: identity matrix, one colour. */
export function constantInstance(gl: WebGL2RenderingContext, col: [number, number, number], a = 1) {
  gl.vertexAttrib4f(LOC.m0, 1, 0, 0, 0);
  gl.vertexAttrib4f(LOC.m1, 0, 1, 0, 0);
  gl.vertexAttrib4f(LOC.m2, 0, 0, 1, 0);
  gl.vertexAttrib4f(LOC.m3, 0, 0, 0, 1);
  gl.vertexAttrib4f(LOC.col, col[0], col[1], col[2], a);
}

/**
 * Screen-space thick lines. Each segment is a quad whose corners carry both
 * endpoints; the vertex shader pushes them apart by a pixel width, so edges
 * stay 1 CSS px at any zoom and any DPR.
 */
export interface Lines {
  vao: WebGLVertexArrayObject;
  count: number;
  buffers: WebGLBuffer[];
}

export function uploadLines(gl: WebGL2RenderingContext, segs: [Vec3, Vec3][]): Lines {
  const a: number[] = [];
  const b: number[] = [];
  const side: number[] = [];
  const idx: number[] = [];
  segs.forEach(([p, q], k) => {
    for (const [t, s] of [[0, -1], [0, 1], [1, 1], [1, -1]] as const) {
      a.push(...p);
      b.push(...q);
      side.push(t, s);
    }
    const o = k * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = (loc: number, data: number[], size: number) => {
    const bb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return bb;
  };
  const buffers = [buf(0, a, 3), buf(1, b, 3), buf(2, side, 2)];
  const ib = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  buffers.push(ib);
  gl.bindVertexArray(null);
  return { vao, count: idx.length, buffers };
}

export function drawLines(gl: WebGL2RenderingContext, l: Lines) {
  gl.bindVertexArray(l.vao);
  gl.drawElements(gl.TRIANGLES, l.count, gl.UNSIGNED_INT, 0);
}

export interface ShadowMap {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  size: number;
}

export function shadowMap(gl: WebGL2RenderingContext, size = 2048): ShadowMap {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, size };
}

/**
 * Size a canvas's backing store to its CSS box × DPR. Returns true if it changed.
 * DPR is capped by the caller (adaptive quality lowers it under load).
 */
export function fitCanvas(canvas: HTMLCanvasElement, dpr: number): boolean {
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
