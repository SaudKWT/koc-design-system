/**
 * A hidden-line technical-drawing renderer in raw WebGL2.
 *
 * Three passes per frame, all instanced:
 *   1. FILL   — every solid in the paper colour with a whisper of shading,
 *               pushed back by polygon offset. This is the hidden-line removal.
 *   2. EDGES  — each template's extracted edges, expanded to screen-space quads
 *               in the vertex shader (WebGL lines are 1px and un-antialiased),
 *               feathered in the fragment shader. Silhouettes of curved
 *               surfaces are decided here, per frame, from the two face normals.
 *   3. X-RAY  — the highlighted part's edges again with depthFunc GREATER and a
 *               dash: exactly the lines the fill pass hid, drawn the way a
 *               drafter draws hidden lines.
 * Free segments (cables, rails, dimensions, flow) go through a line program
 * with the same quad expansion, dashes and flow.
 */

import { m4, v3, type Mat4, type Vec3 } from "./math";
import { INST_STRIDE, SEG_STRIDE, type Template } from "./scene";
import type { Model } from "./rig";
import { mix, type Palette, type RGB } from "./palette";

const TEX_W = 4096;

const COMMON = /* glsl */ `
vec3 toSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

const FILL_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec4 i_m0;
layout(location=3) in vec4 i_m1;
layout(location=4) in vec4 i_m2;
layout(location=5) in vec4 i_m3;
layout(location=6) in vec4 i_meta;
layout(location=7) in vec4 i_n0;
layout(location=8) in vec4 i_n1;
layout(location=9) in vec4 i_n2;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform float u_isolate;
uniform float u_radial;
out vec3 v_n;
flat out vec2 v_pm;
void main() {
  if (u_isolate >= 0.0 && abs(i_meta.x - u_isolate) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  mat4 M = mat4(i_m0, i_m1, i_m2, i_m3);
  vec3 w = (M * vec4(a_pos, 1.0)).xyz + u_offset * i_meta.z;
  w.xz *= u_radial;
  v_n = mat3(i_n0.xyz, i_n1.xyz, i_n2.xyz) * a_nrm;
  v_n.xz /= u_radial;
  v_pm = i_meta.xy;
  gl_Position = u_viewProj * vec4(w, 1.0);
}`;

const FILL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_n;
flat in vec2 v_pm;
uniform vec3 u_lit, u_shade, u_ground, u_hatch, u_primary;
uniform vec3 u_light;
uniform float u_hi, u_hiAmt, u_hatchStep;
out vec4 o;
${COMMON}
void main() {
  vec3 n = normalize(v_n);
  float mat = v_pm.y;
  vec3 c;
  if (mat > 0.5 && mat < 1.5) {
    c = u_ground;
  } else if (mat > 1.5 && mat < 2.5) {
    float h = mod(gl_FragCoord.x + gl_FragCoord.y, u_hatchStep);
    c = mix(u_ground, u_hatch, (1.0 - smoothstep(0.0, 1.3, h)) * 0.7);
  } else {
    float t = clamp(0.5 + 0.5 * dot(n, u_light), 0.0, 1.0);
    c = mix(u_shade, u_lit, t);
    if (mat > 2.5) c = mix(c, u_shade, 0.7);
  }
  if (abs(v_pm.x - u_hi) < 0.5) c = mix(c, u_primary, 0.14 * u_hiAmt);
  o = vec4(toSrgb(c), 1.0);
}`;

/**
 * Shared quad expansion over corners q0(0,-1) q1(1,-1) q2(0,1) q3(1,1). Edges pass
 * the corner index 0–3 directly (indexed); free lines pass 0–5 through
 * [0,1,2, 2,1,3] and map it first.
 */
const EXPAND = /* glsl */ `
uniform mat4 u_viewProj;
uniform vec2 u_viewport;
uniform float u_bias;
out float v_d;
out float v_along;
flat out float v_hw;
flat out float v_part;
flat out float v_len;
void expandQuad(vec3 wa, vec3 wb, float widthPx, int c) {
  vec4 ca = u_viewProj * vec4(wa, 1.0);
  vec4 cb = u_viewProj * vec4(wb, 1.0);
  vec2 sa = ca.xy * 0.5 * u_viewport;
  vec2 sb = cb.xy * 0.5 * u_viewport;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = 0.5 * widthPx;
  float ext = hw + 1.0;
  float along = (c == 1 || c == 3) ? 1.0 : 0.0;
  float side = (c == 0 || c == 1) ? -1.0 : 1.0;
  vec2 p = mix(sa, sb, along) + dir * (along * 2.0 - 1.0) * hw + nrm * side * ext;
  float z = mix(ca.z, cb.z, along) - u_bias;
  gl_Position = vec4(p / (0.5 * u_viewport), z, 1.0);
  v_d = side * ext;
  v_hw = hw;
  v_along = along * len;
  v_len = len;
}
`;

const EDGE_VS = /* glsl */ `#version 300 es
layout(location=0) in vec4 i_m0;
layout(location=1) in vec4 i_m1;
layout(location=2) in vec4 i_m2;
layout(location=3) in vec4 i_m3;
layout(location=4) in vec4 i_meta;
layout(location=5) in vec4 i_n0;
layout(location=6) in vec4 i_n1;
layout(location=7) in vec4 i_n2;
uniform highp sampler2D u_edges;
uniform int u_edgeBase;
uniform vec3 u_viewDir;
uniform vec3 u_offset;
uniform float u_isolate, u_onlyPart;
uniform float u_wFeat, u_wSil;
uniform float u_radial;
flat out float v_mat;
${EXPAND}
vec4 fetch(int t) { return texelFetch(u_edges, ivec2(t % ${TEX_W}, t / ${TEX_W}), 0); }
void main() {
  // Indexed quads: 4 vertices per edge, drawn as [0,1,2, 2,1,3] so the vertex
  // cache runs this shader ~4 times per edge instead of 6.
  int e = u_edgeBase + gl_VertexID / 4;
  int c = gl_VertexID % 4;
  float part = i_meta.x;
  v_part = part;
  v_mat = i_meta.y;
  bool skip = (u_isolate >= 0.0 && abs(part - u_isolate) > 0.5) || (u_onlyPart >= 0.0 && abs(part - u_onlyPart) > 0.5);
  vec4 A = fetch(e * 4);
  mat4 M = mat4(i_m0, i_m1, i_m2, i_m3);
  bool sil = false;
  if (!skip && A.w > 0.5) {
    mat3 N = mat3(i_n0.xyz, i_n1.xyz, i_n2.xyz);
    vec3 na = N * fetch(e * 4 + 2).xyz, nb = N * fetch(e * 4 + 3).xyz;
    na.xz /= u_radial;
    nb.xz /= u_radial;
    float fa = dot(na, u_viewDir);
    float fb = dot(nb, u_viewDir);
    if (fa * fb >= 0.0) skip = true; else sil = true;
  }
  if (skip) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 off = u_offset * i_meta.z;
  vec3 wa = (M * vec4(A.xyz, 1.0)).xyz + off;
  vec3 wb = (M * vec4(fetch(e * 4 + 1).xyz, 1.0)).xyz + off;
  wa.xz *= u_radial;
  wb.xz *= u_radial;
  float fine = i_meta.y > 3.5 ? 0.8 : 1.0;
  expandQuad(wa, wb, (sil ? u_wSil : u_wFeat) * fine, c);
}`;

const LINE_VS = /* glsl */ `#version 300 es
layout(location=0) in vec4 s_a;
layout(location=1) in vec4 s_b;
layout(location=2) in vec4 s_style;
layout(location=3) in vec4 s_meta;
uniform vec3 u_viewDir;
uniform vec3 u_offset;
uniform float u_isolate, u_onlyPart;
uniform float u_dpr;
uniform float u_radial;
out float v_role;
out float v_alpha;
out float v_dash;
out float v_flow;
out float v_dist0px;
${EXPAND}
uniform float u_pxPerUnit;
void main() {
  int c6 = gl_VertexID % 6;
  int c = c6 == 3 ? 2 : c6 == 4 ? 1 : c6 == 5 ? 3 : c6;
  float part = s_meta.x;
  v_part = part;
  if ((u_isolate >= 0.0 && abs(part - u_isolate) > 0.5) || (u_onlyPart >= 0.0 && abs(part - u_onlyPart) > 0.5) || s_b.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  float mm = s_meta.y;
  vec3 lift = -u_viewDir * s_meta.z;
  vec3 wa = s_a.xyz + lift + (mod(mm, 2.0) > 0.5 ? u_offset : vec3(0.0));
  vec3 wb = s_b.xyz + lift + (mm > 1.5 ? u_offset : vec3(0.0));
  wa.xz *= u_radial;
  wb.xz *= u_radial;
  v_role = s_a.w;
  v_alpha = s_b.w;
  v_dash = s_style.y * u_dpr;
  v_flow = s_style.z * u_dpr;
  v_dist0px = s_style.w * u_pxPerUnit;
  expandQuad(wa, wb, s_style.x * u_dpr, c);
}`;

const EDGE_FS = /* glsl */ `#version 300 es
precision highp float;
in float v_d;
in float v_along;
flat in float v_hw;
flat in float v_part;
flat in float v_len;
flat in float v_mat;
uniform vec3 u_ink, u_primary;
uniform float u_hi, u_hiAmt, u_alpha, u_dim, u_dash, u_force;
out vec4 o;
${COMMON}
void main() {
  float a = clamp(v_hw + 0.5 - abs(v_d), 0.0, 1.0);
  if (v_mat > 3.5) a *= 0.34;
  if (u_dash > 0.0) a *= smoothstep(0.35, 0.45, fract(v_along / u_dash)) * (1.0 - smoothstep(0.85, 0.95, fract(v_along / u_dash)));
  bool hi = abs(v_part - u_hi) < 0.5;
  vec3 c = (hi || u_force > 0.5) ? mix(u_ink, u_primary, max(u_hiAmt, u_force)) : u_ink;
  float alpha = u_alpha * a * ((hi || u_force > 0.5) ? 1.0 : mix(1.0, u_dim, u_hiAmt));
  o = vec4(toSrgb(c) * alpha, alpha);
}`;

const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in float v_d;
in float v_along;
flat in float v_hw;
flat in float v_part;
flat in float v_len;
in float v_role;
in float v_alpha;
in float v_dash;
in float v_flow;
in float v_dist0px;
uniform vec3 u_ink, u_primary, u_faint;
uniform float u_hi, u_hiAmt, u_dim, u_time, u_flowAmt, u_xray, u_alphaMul;
out vec4 o;
${COMMON}
void main() {
  float a = clamp(v_hw + 0.5 - abs(v_d), 0.0, 1.0);
  float role = v_role;
  vec3 c = role < 0.5 ? u_ink : role < 1.5 ? u_primary : u_faint;
  bool hi = abs(v_part - u_hi) < 0.5;
  if (hi && role < 0.5) c = mix(u_ink, u_primary, u_hiAmt);
  if (u_xray > 0.5) c = u_primary;
  float alpha = v_alpha * a * u_alphaMul;
  if (v_dash > 0.0) {
    float s = (v_dist0px + v_along - u_time * v_flow) / v_dash;
    alpha *= smoothstep(0.0, 0.12, fract(s)) * (1.0 - smoothstep(0.5, 0.62, fract(s)));
    if (v_flow != 0.0) alpha *= u_flowAmt;
  }
  if (u_xray > 0.5) {
    float s = v_along / (5.0 * max(1.0, v_hw));
    alpha *= step(0.45, fract(s));
  }
  if (!hi && part_dim_ok(role)) alpha *= mix(1.0, u_dim, u_hiAmt);
  o = vec4(toSrgb(c) * alpha, alpha);
}`.replace("part_dim_ok(role)", "(v_part < 8.5)");

export interface CameraSpec {
  yaw: number;
  pitch: number;
  /** Ortho window in view space: centre and half-height. */
  cx: number;
  cy: number;
  halfH: number;
}

export interface Frame {
  cam: CameraSpec;
  quill: number;
  time: number;
  flowAmt: number;
  highlight: number;
  hiAmt: number;
  /** Hidden lines to draw dashed; `tint` draws them in primary rather than ink. */
  xray: { part: number; alpha: number; tint: number }[];
  isolate: number;
  /** Horizontal exaggeration, as well schematics draw diameters. 1 = true scale. */
  radial?: number;
  dynSegs: Float32Array;
  dynSegCount: number;
  dynStands: Float32Array;
  dynStandCount: number;
}

interface GpuBatch {
  /** Which parts have instances here — x-ray and isolate passes skip batches without theirs. */
  parts: Set<number>;
  count: number;
  indexCount: number;
  edgeBase: number;
  edgeCount: number;
  fillVao: WebGLVertexArrayObject;
  edgeVao: WebGLVertexArrayObject;
  inst: WebGLBuffer;
}

export interface RenderTarget {
  fbo: WebGLFramebuffer | null;
  w: number;
  h: number;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`${type === gl.VERTEX_SHADER ? "VS" : "FS"}: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;
function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram): Uniforms {
  const out: Uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let k = 0; k < n; k++) {
    const info = gl.getActiveUniform(p, k)!;
    out[info.name] = gl.getUniformLocation(p, info.name);
  }
  return out;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private fill: WebGLProgram;
  private edge: WebGLProgram;
  private line: WebGLProgram;
  private uf: Uniforms;
  private ue: Uniforms;
  private ul: Uniforms;
  private batches: GpuBatch[] = [];
  private standBatch: GpuBatch;
  private edgeTex: WebGLTexture;
  /** [4e, 4e+1, 4e+2, 4e+2, 4e+1, 4e+3] for every edge of the largest template. */
  private quadIdx: WebGLBuffer;
  private staticLines: { vao: WebGLVertexArrayObject; count: number };
  private dynLines: { vao: WebGLVertexArrayObject; buf: WebGLBuffer; cap: number };
  private palette: Palette | null = null;
  dpr = 1;
  /** Development profiling only: skip whole passes. */
  skip = { fills: false, edges: false, lines: false, xray: false };

  constructor(gl: WebGL2RenderingContext, model: Model) {
    this.gl = gl;
    this.fill = compile(gl, FILL_VS, FILL_FS);
    this.edge = compile(gl, EDGE_VS, EDGE_FS);
    this.line = compile(gl, LINE_VS, LINE_FS);
    this.uf = uniforms(gl, this.fill);
    this.ue = uniforms(gl, this.edge);
    this.ul = uniforms(gl, this.line);

    // one texture holds every template's edges
    const templates = [...model.templates.values()];
    const bases = new Map<string, number>();
    let total = 0;
    for (const t of templates) {
      bases.set(t.name, total);
      total += t.edges.count;
    }
    const rows = Math.max(1, Math.ceil((total * 4) / TEX_W));
    const data = new Float32Array(TEX_W * rows * 4);
    for (const t of templates) data.set(t.edges.data, bases.get(t.name)! * 16);
    this.edgeTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.edgeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX_W, rows, 0, gl.RGBA, gl.FLOAT, data);

    const maxEdges = Math.max(...templates.map((t) => t.edges.count), 1);
    const qi = new Uint32Array(maxEdges * 6);
    for (let e = 0; e < maxEdges; e++) qi.set([4 * e, 4 * e + 1, 4 * e + 2, 4 * e + 2, 4 * e + 1, 4 * e + 3], e * 6);
    this.quadIdx = gl.createBuffer()!;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, qi, gl.STATIC_DRAW);
    const geo = new Map<string, { pos: WebGLBuffer; nrm: WebGLBuffer; idx: WebGLBuffer; n: number }>();
    const geoOf = (t: Template) => {
      let g = geo.get(t.name);
      if (!g) {
        const pos = gl.createBuffer()!, nrm = gl.createBuffer()!, idx = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, pos);
        gl.bufferData(gl.ARRAY_BUFFER, t.mesh.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
        gl.bufferData(gl.ARRAY_BUFFER, t.mesh.normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t.mesh.indices, gl.STATIC_DRAW);
        g = { pos, nrm, idx, n: t.mesh.indices.length };
        geo.set(t.name, g);
      }
      return g;
    };
    const makeBatch = (t: Template, instData: Float32Array | null, count: number, usage: number): GpuBatch => {
      const parts = new Set<number>();
      if (instData) for (let k = 0; k < count; k++) parts.add(instData[k * INST_STRIDE + 16]);
      const g = geoOf(t);
      const inst = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      if (instData) gl.bufferData(gl.ARRAY_BUFFER, instData, usage);
      else gl.bufferData(gl.ARRAY_BUFFER, 4 * INST_STRIDE * 4, usage);
      const bindInst = (first: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        for (let k = 0; k < 8; k++) {
          gl.enableVertexAttribArray(first + k);
          gl.vertexAttribPointer(first + k, 4, gl.FLOAT, false, INST_STRIDE * 4, k * 16);
          gl.vertexAttribDivisor(first + k, 1);
        }
      };
      const fillVao = gl.createVertexArray()!;
      gl.bindVertexArray(fillVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.nrm);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx);
      bindInst(2);
      const edgeVao = gl.createVertexArray()!;
      gl.bindVertexArray(edgeVao);
      bindInst(0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIdx);
      gl.bindVertexArray(null);
      return { parts, count, indexCount: g.n, edgeBase: bases.get(t.name)!, edgeCount: t.edges.count, fillVao, edgeVao, inst };
    };
    for (const b of model.batches) this.batches.push(makeBatch(b.template, b.data, b.count, gl.STATIC_DRAW));
    this.standBatch = makeBatch(model.templates.get("stand")!, null, 0, gl.DYNAMIC_DRAW);
    this.standBatch.parts.add(2); // the moving stands are the rig's

    const lineVao = (buf: WebGLBuffer) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(k);
        gl.vertexAttribPointer(k, 4, gl.FLOAT, false, SEG_STRIDE * 4, k * 16);
        gl.vertexAttribDivisor(k, 1);
      }
      gl.bindVertexArray(null);
      return vao;
    };
    const sBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sBuf);
    gl.bufferData(gl.ARRAY_BUFFER, model.segs, gl.STATIC_DRAW);
    this.staticLines = { vao: lineVao(sBuf), count: model.segs.length / SEG_STRIDE };
    const dBuf = gl.createBuffer()!;
    const cap = 4096;
    gl.bindBuffer(gl.ARRAY_BUFFER, dBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cap * SEG_STRIDE * 4, gl.DYNAMIC_DRAW);
    this.dynLines = { vao: lineVao(dBuf), buf: dBuf, cap };
  }

  setPalette(p: Palette) {
    this.palette = p;
  }

  /** View matrix for a yaw/pitch orbit about the origin. Target shifts live in the ortho window. */
  static view(yaw: number, pitch: number): { view: Mat4; dir: Vec3 } {
    const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const eye = v3.scale(dir, 2000);
    return { view: m4.lookAt(eye, [0, 0, 0], [0, 1, 0]), dir };
  }

  static matrices(cam: CameraSpec, aspect: number) {
    const { view, dir } = Renderer.view(cam.yaw, cam.pitch);
    const hw = cam.halfH * aspect;
    const proj = m4.ortho(cam.cx - hw, cam.cx + hw, cam.cy - cam.halfH, cam.cy + cam.halfH, 1400, 2600);
    return { viewProj: m4.mul(proj, view), viewDir: v3.scale(dir, -1) as Vec3 };
  }

  render(f: Frame, target?: RenderTarget) {
    const gl = this.gl;
    const pal = this.palette;
    if (!pal || gl.isContextLost()) return;
    const w = target ? target.w : gl.drawingBufferWidth;
    const h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { viewProj, viewDir } = Renderer.matrices(f.cam, w / h);
    const pxPerUnit = h / (2 * f.cam.halfH);
    const offset: Vec3 = [0, f.quill, 0];
    const dpr = this.dpr;

    const lit: RGB = pal.dark ? mix(pal.card, pal.foreground, 0.07) : pal.card;
    const shade: RGB = pal.dark ? mix(pal.card, pal.background, 0.55) : mix(pal.card, pal.foreground, 0.075);
    const ink: RGB = pal.dark ? mix(pal.foreground, pal.card, 0.12) : pal.foreground;
    const faint: RGB = pal.mutedForeground;
    const light = v3.norm([0.25, 1.0, 0.6]);

    // 1 — fills
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    gl.useProgram(this.fill);
    const U = this.uf;
    gl.uniformMatrix4fv(U.u_viewProj, false, viewProj);
    gl.uniform3fv(U.u_offset, offset);
    gl.uniform1f(U.u_isolate, f.isolate);
    gl.uniform1f(U.u_radial, f.radial ?? 1);
    gl.uniform3fv(U.u_lit, lit);
    gl.uniform3fv(U.u_shade, shade);
    gl.uniform3fv(U.u_ground, pal.background);
    gl.uniform3fv(U.u_hatch, mix(pal.background, pal.mutedForeground, 0.45));
    gl.uniform3fv(U.u_primary, pal.primary);
    gl.uniform3fv(U.u_light, light);
    gl.uniform1f(U.u_hi, f.highlight);
    gl.uniform1f(U.u_hiAmt, f.hiAmt);
    gl.uniform1f(U.u_hatchStep, Math.max(5, 6 * dpr));
    const wants = (b: GpuBatch, part: number) => part < 0 || b.parts.has(part);
    const drawFills = (b: GpuBatch, n: number) => {
      if (!n || !wants(b, f.isolate)) return;
      gl.bindVertexArray(b.fillVao);
      gl.drawElementsInstanced(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_INT, 0, n);
    };
    this.uploadStands(f);
    if (!this.skip.fills) {
      for (const b of this.batches) drawFills(b, b.count);
      drawFills(this.standBatch, f.dynStandCount);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2 — edges and free lines
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    const edgePass = (alpha: number, onlyPart: number, dash: number, force: number) => {
      gl.useProgram(this.edge);
      const E = this.ue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.edgeTex);
      gl.uniform1i(E.u_edges, 0);
      gl.uniformMatrix4fv(E.u_viewProj, false, viewProj);
      gl.uniform2f(E.u_viewport, w, h);
      gl.uniform1f(E.u_bias, 2e-4);
      gl.uniform3fv(E.u_viewDir, viewDir);
      gl.uniform3fv(E.u_offset, offset);
      gl.uniform1f(E.u_isolate, f.isolate);
      gl.uniform1f(E.u_onlyPart, onlyPart);
      gl.uniform1f(E.u_radial, f.radial ?? 1);
      gl.uniform1f(E.u_wFeat, 1.0 * dpr);
      gl.uniform1f(E.u_wSil, 1.25 * dpr);
      gl.uniform3fv(E.u_ink, ink);
      gl.uniform3fv(E.u_primary, pal.primary);
      gl.uniform1f(E.u_hi, f.highlight);
      gl.uniform1f(E.u_hiAmt, f.hiAmt);
      gl.uniform1f(E.u_alpha, alpha);
      gl.uniform1f(E.u_dim, 0.45);
      gl.uniform1f(E.u_dash, dash);
      gl.uniform1f(E.u_force, force);
      const draw = (b: GpuBatch, n: number) => {
        if (!n || !b.edgeCount || !wants(b, f.isolate) || !wants(b, onlyPart)) return;
        gl.bindVertexArray(b.edgeVao);
        gl.uniform1i(E.u_edgeBase, b.edgeBase);
        gl.drawElementsInstanced(gl.TRIANGLES, b.edgeCount * 6, gl.UNSIGNED_INT, 0, n);
      };
      for (const b of this.batches) draw(b, b.count);
      draw(this.standBatch, f.dynStandCount);
    };
    const linePass = (onlyPart: number, xray: number, alphaMul: number) => {
      gl.useProgram(this.line);
      const L = this.ul;
      gl.uniformMatrix4fv(L.u_viewProj, false, viewProj);
      gl.uniform2f(L.u_viewport, w, h);
      gl.uniform1f(L.u_bias, 3e-4);
      gl.uniform3fv(L.u_viewDir, viewDir);
      gl.uniform3fv(L.u_offset, offset);
      gl.uniform1f(L.u_isolate, f.isolate);
      gl.uniform1f(L.u_onlyPart, onlyPart);
      gl.uniform1f(L.u_radial, f.radial ?? 1);
      gl.uniform1f(L.u_dpr, dpr);
      gl.uniform1f(L.u_pxPerUnit, pxPerUnit);
      gl.uniform3fv(L.u_ink, ink);
      gl.uniform3fv(L.u_primary, pal.primary);
      gl.uniform3fv(L.u_faint, faint);
      gl.uniform1f(L.u_hi, f.highlight);
      gl.uniform1f(L.u_hiAmt, f.hiAmt);
      gl.uniform1f(L.u_dim, 0.45);
      gl.uniform1f(L.u_time, f.time);
      gl.uniform1f(L.u_flowAmt, f.flowAmt);
      gl.uniform1f(L.u_xray, xray);
      gl.uniform1f(L.u_alphaMul, alphaMul);
      gl.bindVertexArray(this.staticLines.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.staticLines.count);
      if (f.dynSegCount) {
        gl.bindVertexArray(this.dynLines.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynLines.buf);
        const n = Math.min(f.dynSegCount, this.dynLines.cap);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.dynSegs, 0, n * SEG_STRIDE);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      }
    };
    if (!this.skip.edges) edgePass(pal.dark ? 0.78 : 0.86, -1, 0, 0);
    if (!this.skip.lines) linePass(-1, 0, 1);

    // 3 — x-ray: hidden lines of the chosen parts, dashed
    if (f.xray.length && !this.skip.xray) {
      gl.depthFunc(gl.GREATER);
      for (const x of f.xray) {
        if (x.alpha <= 0.01) continue;
        edgePass(x.alpha, x.part, 5 * dpr, x.tint);
        linePass(x.part, x.tint > 0.5 ? 1 : 0, x.alpha);
      }
    }

    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private uploadStands(f: Frame) {
    const gl = this.gl;
    this.standBatch.count = f.dynStandCount;
    if (!f.dynStandCount) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.standBatch.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.dynStands, 0, f.dynStandCount * INST_STRIDE);
  }

  /**
   * Render one isolated part into an offscreen multisampled target and read it
   * back as ImageData — the team thumbnails are drawn by the same renderer,
   * from the same model, never from an image.
   */
  snapshot(f: Frame, w: number, h: number): ImageData | null {
    const gl = this.gl;
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    const msFbo = gl.createFramebuffer();
    const color = gl.createRenderbuffer();
    const depth = gl.createRenderbuffer();
    const outFbo = gl.createFramebuffer();
    const outRb = gl.createRenderbuffer();
    if (!msFbo || !color || !depth || !outFbo || !outRb) return null;
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindRenderbuffer(gl.RENDERBUFFER, outRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, outRb);
    this.render(f, { fbo: msFbo, w, h });
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, outFbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(msFbo);
    gl.deleteFramebuffer(outFbo);
    gl.deleteRenderbuffer(color);
    gl.deleteRenderbuffer(depth);
    gl.deleteRenderbuffer(outRb);
    // flip rows and un-premultiply
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        const a = px[src + x + 3];
        const k = a ? 255 / a : 0;
        img.data[dst + x] = Math.min(255, px[src + x] * k);
        img.data[dst + x + 1] = Math.min(255, px[src + x + 1] * k);
        img.data[dst + x + 2] = Math.min(255, px[src + x + 2] * k);
        img.data[dst + x + 3] = a;
      }
    }
    return img;
  }
}

/**
 * Fit an ortho window around `pts` for one or more yaws, inside a viewport of
 * `w`×`h` px with `inset` px of clearance. Using several yaws makes the fit
 * stable while the camera sways, so the drawing never breathes.
 */
export function fitCamera(
  pts: Vec3[],
  yaws: number[],
  pitch: number,
  w: number,
  h: number,
  inset: { l: number; r: number; t: number; b: number },
): CameraSpec {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const yaw of yaws) {
    const { view } = Renderer.view(yaw, pitch);
    for (const p of pts) {
      const q = m4.point(view, p);
      x0 = Math.min(x0, q[0]);
      x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]);
      y1 = Math.max(y1, q[1]);
    }
  }
  const aw = Math.max(40, w - inset.l - inset.r);
  const ah = Math.max(40, h - inset.t - inset.b);
  // world units per px so the content fits both ways
  const upp = Math.max((x1 - x0) / aw, (y1 - y0) / ah);
  const halfH = (h * upp) / 2;
  // centre content in the inset box, then express the window centre
  const cxContent = (x0 + x1) / 2, cyContent = (y0 + y1) / 2;
  const boxCx = inset.l + aw / 2, boxCy = inset.t + ah / 2; // px from top-left
  const cx = cxContent - (boxCx - w / 2) * upp;
  const cy = cyContent + (boxCy - h / 2) * upp;
  return { yaw: yaws[Math.floor(yaws.length / 2)], pitch, cx, cy, halfH };
}

/** Project a world point to CSS px (top-left origin). */
export function project(cam: CameraSpec, w: number, h: number, p: Vec3): [number, number, number] {
  const { viewProj } = Renderer.matrices(cam, w / h);
  const q = m4.point(viewProj, p);
  return [(q[0] * 0.5 + 0.5) * w, (1 - (q[1] * 0.5 + 0.5)) * h, q[2]];
}
