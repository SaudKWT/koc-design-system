/**
 * Raw WebGL2 renderer for the plate. No three.js — KOC's library approval
 * freezes what it approves, so the 3D is ~600 lines owned here instead of a
 * dependency owned by someone else.
 *
 * Passes:
 *   1. shadow   depth-only, from the key light, 1024². Re-rendered only while
 *               parts are moving — the light is fixed to the model, the camera
 *               is not, so an orbiting camera costs nothing here.
 *   2. ground   premultiplied alpha over a transparent canvas: the page's own
 *               background shows through, so the plate sits ON the page (the
 *               INFRA look) instead of in a box.
 *   3. parts    clay shading, blueprint panel grid, baked cavity, soft PCF shadows.
 *   4. lines    the centreline and explode traces, depth-tested so a part hides
 *               the line behind it — a drawing convention an overlay cannot keep.
 *
 * MSAA from the default framebuffer, DPR capped at 2.
 */

import { EXPLODE, partProgress, type Anchor, type BitModel, type CalloutId } from "./bit";
import {
  basis,
  cross,
  identity,
  lookAt,
  mul,
  norm,
  ortho,
  perspective,
  project,
  rotation,
  sub,
  transformPoint,
  add,
  scale,
  len,
  type M4,
  type V3,
} from "./math";
import type { MeshData } from "./mesh";
import { mix, type Palette, type RGB } from "./tokens";

// 1024², not 2048²: the shadow pass is fill-bound, and at 2048 it halved the
// frame rate during the explode (measured, M4, 1440×900 @2). The PCF kernel is
// wide enough that the extra texels were never visible.
const SHADOW = 1024;
const FOV = (19 * Math.PI) / 180;
const GROUND_Y = -0.45;
const LIGHT: V3 = norm([-0.3, 1.0, 0.26]);
const SCENE_C: V3 = [0, 8.8, 0];

// ── Shaders ─────────────────────────────────────────────────────────────────

const VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_pnl;
layout(location=3) in vec2 a_mat;
layout(location=4) in mat4 a_model;
uniform mat4 u_vp;
uniform mat4 u_lvp;
out vec3 v_w;
out vec3 v_n;
out vec2 v_p;
out vec2 v_m;
out vec4 v_ls;
void main() {
  vec4 w = a_model * vec4(a_pos, 1.0);
  v_w = w.xyz;
  v_n = mat3(a_model) * a_nrm;
  v_p = a_pnl;
  v_m = a_mat;
  // Normal-offset lookup: surfaces nearly parallel to the light (the crown's
  // skirt) otherwise stripe with shadow acne at 1024².
  v_ls = u_lvp * vec4(w.xyz + normalize(v_n) * 0.035, 1.0);
  gl_Position = u_vp * w;
}`;

const SRGB_FN = /* glsl */ `
vec3 toSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}`;

const SHADOW_FNS = /* glsl */ `
uniform highp sampler2DShadow u_shadow;
uniform vec2 u_texel;
const vec2 PD[12] = vec2[](
  vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2( 0.962,-0.195), vec2( 0.473,-0.480), vec2( 0.519, 0.767), vec2( 0.185,-0.893),
  vec2( 0.507, 0.064), vec2( 0.896, 0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
float shadowAt(vec4 ls, float rad, float bias) {
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  for (int i = 0; i < 12; i++) s += texture(u_shadow, vec3(p.xy + PD[i] * rad * u_texel, p.z - bias));
  return s / 12.0;
}
${SRGB_FN}`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_w;
in vec3 v_n;
in vec2 v_p;
in vec2 v_m;
in vec4 v_ls;
${SHADOW_FNS}
uniform vec3 u_cam;
uniform vec3 u_L;
uniform vec3 u_clay;
uniform vec3 u_prim;
uniform vec3 u_face;
uniform vec3 u_ink;
uniform vec3 u_sky;
uniform vec3 u_gnd;
uniform vec3 u_key;
uniform vec3 u_rim;
uniform vec3 u_line;
uniform float u_lineA;
uniform float u_rimA;
uniform float u_shadowFloor;
out vec4 o;
void main() {
  int mat = int(v_m.x + 0.5);
  float ao = v_m.y;
  vec3 N = normalize(v_n);
  vec3 V = normalize(u_cam - v_w);
  float nv = dot(N, V);
  vec3 alb = u_clay;
  float ks = 0.06, shin = 18.0, refl = 0.0;
  if (mat == 1) { alb = u_prim; ks = 0.28; shin = 60.0; }
  else if (mat == 2) { alb = u_face; ks = 1.1; shin = 220.0; refl = 0.35; }
  else if (mat == 3) { alb = u_ink; ks = 0.45; shin = 90.0; refl = 0.12; }

  float ndl = dot(N, u_L);
  float sh = shadowAt(v_ls, 1.8, 0.0012);
  float wrap = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
  vec3 hemi = mix(u_gnd, u_sky, N.y * 0.5 + 0.5);
  vec3 col = alb * (hemi * ao + u_key * wrap * mix(u_shadowFloor, 1.0, sh) * mix(0.75, 1.0, ao));

  vec3 H = normalize(u_L + V);
  col += u_key * ks * pow(max(dot(N, H), 0.0), shin) * sh;
  if (refl > 0.0) {
    vec3 R = reflect(-V, N);
    col += mix(u_gnd, u_sky, smoothstep(-0.2, 0.6, R.y)) * refl * (0.4 + 0.6 * pow(1.0 - max(nv, 0.0), 3.0));
  }

  // Blueprint panelling: a half-inch grid in world units over every clay face.
  if (mat == 0 && u_lineA > 0.0) {
    vec2 q = v_p * 2.0;
    vec2 fw = max(fwidth(q), vec2(1e-4));
    vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
    float line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
    line *= 1.0 - smoothstep(0.18, 0.55, max(fw.x, fw.y));
    col = mix(col, u_line, line * u_lineA);
  }

  // The far faces melt into the page — INFRA's airy edges.
  float fr = pow(1.0 - clamp(nv, 0.0, 1.0), 3.5);
  col = mix(col, u_rim, fr * u_rimA);
  o = vec4(toSrgb(col), 1.0);
}`;

const DEPTH_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=4) in mat4 a_model;
uniform mat4 u_lvp;
void main() { gl_Position = u_lvp * a_model * vec4(a_pos, 1.0); }`;

const DEPTH_FS = /* glsl */ `#version 300 es
precision mediump float;
void main() {}`;

const GROUND_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp;
uniform mat4 u_lvp;
out vec3 v_w;
out vec4 v_ls;
void main() {
  v_w = a_pos;
  v_ls = u_lvp * vec4(a_pos, 1.0);
  gl_Position = u_vp * vec4(a_pos, 1.0);
}`;

const GROUND_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_w;
in vec4 v_ls;
${SHADOW_FNS}
uniform vec3 u_ink;
uniform vec3 u_line;
uniform float u_shadowA;
uniform float u_ringA;
out vec4 o;
float hair(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 1.5, abs(d)); }
void main() {
  float r = length(v_w.xz);
  // The floor is fill-rate, not geometry: most of its pixels are empty page.
  if (r > 14.0) discard;
  float px = max(fwidth(r), 1e-4);
  float fade = 1.0 - smoothstep(7.5, 14.0, r);

  // Wide kernel, sampled twice at two radii: the lifted crown's shadow falls
  // a long way, and a long shadow is a soft one. Only where a shadow can land.
  float sh = r < 11.5 ? 0.5 * (shadowAt(v_ls, 6.0, 0.002) + shadowAt(v_ls, 13.0, 0.002)) : 1.0;
  // Contact term under the pin nose — the shank never leaves the ground.
  float contact = exp(-r * r / 5.0) * 0.55;
  float dark = clamp((1.0 - sh) * 0.9 + contact, 0.0, 1.0) * fade * u_shadowA;

  // A rotary-table dial: two rings, a tick every 5°, a longer one every 30°.
  float ang = atan(v_w.z, v_w.x);
  float step5 = radians(5.0);
  float d5 = abs(fract(ang / step5 + 0.5) - 0.5) * step5 * r;
  float d30 = abs(fract(ang / (step5 * 6.0) + 0.5) - 0.5) * step5 * 6.0 * r;
  float band5 = step(6.62, r) * step(r, 6.9);
  float band30 = step(6.62, r) * step(r, 7.18);
  float ring = max(max(hair(r - 6.62, px), hair(r - 7.32, px)),
                   max(hair(d5, px) * band5, hair(d30, px) * band30));
  float ringA = ring * u_ringA;

  vec3 col = u_ink * dark + u_line * ringA;
  float a = clamp(dark + ringA, 0.0, 1.0);
  o = vec4(toSrgb(col / max(a, 1e-4)) * a, a);
}`;

const LINE_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=4) in mat4 a_model;
uniform mat4 u_vp;
out float v_d;
out float v_kind;
void main() {
  // Column 1 carries the segment (direction × length); column 3's w is unused
  // by a rigid transform, so it carries the dash style.
  v_d = a_pos.y * length(a_model[1].xyz);
  v_kind = a_model[0].w;
  mat4 m = a_model;
  m[0].w = 0.0;
  gl_Position = u_vp * m * vec4(a_pos, 1.0);
}`;

const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in float v_d;
in float v_kind;
uniform vec3 u_line;
out vec4 o;
${SRGB_FN}
void main() {
  if (v_kind < 0.5) {
    // Centreline: long dash, gap, short dash, gap.
    float t = mod(v_d, 1.5);
    if ((t > 0.95 && t < 1.12) || t > 1.3) discard;
  } else {
    if (mod(v_d, 0.2) > 0.11) discard;
  }
  o = vec4(toSrgb(u_line), 1.0);
}`;

// ── GL plumbing ─────────────────────────────────────────────────────────────

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

interface GpuMesh {
  vao: WebGLVertexArrayObject;
  count: number;
  inst: WebGLBuffer;
  instances: number;
  data: Float32Array;
}

function upload(gl: WebGL2RenderingContext, m: MeshData, instances: number, owned: WebGLBuffer[]): GpuMesh {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const attr = (loc: number, data: Float32Array, size: number) => {
    const b = gl.createBuffer()!;
    owned.push(b);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr(0, m.pos, 3);
  attr(1, m.nrm, 3);
  attr(2, m.pnl, 2);
  attr(3, m.mat, 2);
  const ib = gl.createBuffer()!;
  owned.push(ib);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
  const data = new Float32Array(16 * instances);
  for (let k = 0; k < instances; k++) data.set(identity(), k * 16);
  const inst = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  for (let c = 0; c < 4; c++) {
    gl.enableVertexAttribArray(4 + c);
    gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 64, c * 16);
    gl.vertexAttribDivisor(4 + c, 1);
  }
  gl.bindVertexArray(null);
  return { vao, count: m.idx.length, inst, instances, data };
}

/** A unit cylinder along +y, radius 1 — instanced into every drawn line. */
function lineCylinder(): MeshData {
  const seg = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= 1; j++)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a), j, Math.sin(a));
    }
  for (let i = 0; i < seg; i++) {
    const a = i;
    const b = i + 1;
    const c = i + seg + 1;
    const d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const n = pos.length / 3;
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(n * 3),
    pnl: new Float32Array(n * 2),
    mat: new Float32Array(n * 2),
    idx: new Uint32Array(idx),
  };
}

// ── Public surface ──────────────────────────────────────────────────────────

export interface Layout {
  /** Where the bit's centre sits, in NDC. */
  shiftX: number;
  shiftY: number;
  /** Fraction of the canvas the bit may fill. */
  availW: number;
  availH: number;
}

export interface Frame {
  /** 0 assembled … 1 exploded — linear time; each part eases inside its own window. */
  explode: number;
  azimuth: number;
  elevation: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Projection {
  anchors: Record<CalloutId, ScreenPoint>;
  /** The bit's projected extent, for placing the callout column. */
  right: number;
  top: number;
  bottom: number;
}

/**
 * The canvas's WebGL2 context, or null when there is no GPU behind it.
 *
 * Software GL (SwiftShader, llvmpipe, a VDI desktop with no GPU) would draw
 * 690k triangles on the CPU and freeze the page: headless Chromium on
 * SwiftShader sat on this scene for 30 s without returning control. Checked
 * BEFORE the meshes are built, so a fallback user never pays for them.
 * Same attributes on every call, so a second call returns the same context.
 */
export function hardwareContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;
  // Chrome does not count its own SwiftShader as a "major caveat", so ask its name.
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) ? null : gl;
}

const LINE_R = 0.016;

export class PlateRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private model!: BitModel;
  private progMain!: WebGLProgram;
  private progDepth!: WebGLProgram;
  private progGround!: WebGLProgram;
  private progLine!: WebGLProgram;
  private shank!: GpuMesh;
  private crown!: GpuMesh;
  private cutters!: GpuMesh;
  private nozzles!: GpuMesh;
  private lines!: GpuMesh;
  private ground!: { vao: WebGLVertexArrayObject; count: number };
  private shadowTex!: WebGLTexture;
  private shadowFbo!: WebGLFramebuffer;
  private lightVP: M4;
  private palette: Palette | null = null;
  private lastShadowExplode = -1;
  private cssW = 1;
  private cssH = 1;
  private layout: Layout = { shiftX: 0, shiftY: 0, availW: 1, availH: 1 };
  private uni = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private buffers: WebGLBuffer[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const lightView = lookAt(add(SCENE_C, scale(LIGHT, 40)), SCENE_C, [0, 1, 0]);
    this.lightVP = mul(ortho(-12.5, 12.5, -12.5, 12.5, 26, 56), lightView);
  }

  get stats() {
    return this.model.stats;
  }

  /** Create every GL resource from a built model. Called again after a context restore. */
  init(model: BitModel): boolean {
    const gl = hardwareContext(this.canvas);
    if (!gl) return false;
    this.gl = gl;
    this.model = model;
    this.uni.clear();
    this.lastShadowExplode = -1;
    this.progMain = compile(gl, VS, FS);
    this.progDepth = compile(gl, DEPTH_VS, DEPTH_FS);
    this.progGround = compile(gl, GROUND_VS, GROUND_FS);
    this.progLine = compile(gl, LINE_VS, LINE_FS);

    const m = this.model;
    this.buffers = [];
    this.shank = upload(gl, m.shank, 1, this.buffers);
    this.crown = upload(gl, m.crown, 1, this.buffers);
    this.cutters = upload(gl, m.cutter, m.cutters.length, this.buffers);
    this.nozzles = upload(gl, m.nozzle, m.nozzles.length, this.buffers);
    this.lines = upload(gl, lineCylinder(), 1 + m.cutters.length + m.nozzles.length + 1, this.buffers);

    // Ground: one quad at the floor, just big enough for the faded disc.
    const g = 14.5;
    const gvao = gl.createVertexArray()!;
    gl.bindVertexArray(gvao);
    const gb = gl.createBuffer()!;
    this.buffers.push(gb);
    gl.bindBuffer(gl.ARRAY_BUFFER, gb);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-g, GROUND_Y, -g, g, GROUND_Y, -g, -g, GROUND_Y, g, g, GROUND_Y, g]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.ground = { vao: gvao, count: 4 };

    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  setPalette(p: Palette) {
    this.palette = p;
  }

  setLayout(l: Layout) {
    this.layout = l;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    const d = Math.min(2, dpr);
    const w = Math.round(this.cssW * d);
    const h = Math.round(this.cssH * d);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private u(p: WebGLProgram, name: string) {
    let m = this.uni.get(p);
    if (!m) this.uni.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl!.getUniformLocation(p, name));
    return m.get(name)!;
  }

  /** Every part's world transform for this explode fraction. */
  private pose(e: number) {
    const m = this.model;
    const pp = partProgress(e);
    const lift = EXPLODE.crownLift * pp.crown;
    const crown = basis([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, lift, 0]);
    const cutters = m.cutters.map((c) => {
      const k = pp.cutter(c.order);
      const out = new Float32Array(c.m);
      out[12] += c.f[0] * EXPLODE.cutterTravel * k;
      out[13] += c.f[1] * EXPLODE.cutterTravel * k + lift;
      out[14] += c.f[2] * EXPLODE.cutterTravel * k;
      return { m: out, k };
    });
    const nozzles = m.nozzles.map((n) => {
      const k = pp.nozzle(n.order);
      // Backs out along its axis, unscrewing as it goes.
      // Positive about local +y is counter-clockwise seen from the head —
      // how a right-hand thread comes out. Composed in the nozzle's own frame: M · R.
      const spin = rotation([0, 1, 0], EXPLODE.nozzleTurns * Math.PI * 2 * k);
      const x: V3 = [n.m[0], n.m[1], n.m[2]];
      const y: V3 = [n.m[4], n.m[5], n.m[6]];
      const z: V3 = [n.m[8], n.m[9], n.m[10]];
      const inFrame = (c: V3) => add(add(scale(x, c[0]), scale(y, c[1])), scale(z, c[2]));
      const X = inFrame(spin[0]);
      const Z = inFrame(spin[2]);
      const t: V3 = [
        n.m[12] + n.axis[0] * EXPLODE.nozzleTravel * k,
        n.m[13] + n.axis[1] * EXPLODE.nozzleTravel * k + lift,
        n.m[14] + n.axis[2] * EXPLODE.nozzleTravel * k,
      ];
      return { m: basis(X, y, Z, t), k };
    });
    return { lift, crown, cutters, nozzles, crownK: pp.crown };
  }

  private camera(f: Frame, crownK: number) {
    const aspect = this.cssW / this.cssH;
    const target: V3 = [0, 6.9 + 2.0 * crownK, 0];
    const tf = Math.tan(FOV / 2);
    const { availW, availH, shiftX, shiftY } = this.layout;
    // Frame the fully exploded assembly, so nothing crops mid-animation.
    const dist = Math.max(10.3 / (tf * availH), 6.4 / (tf * aspect * availW));
    const ce = Math.cos(f.elevation);
    const eye: V3 = [
      target[0] + dist * ce * Math.sin(f.azimuth),
      target[1] + dist * Math.sin(f.elevation),
      target[2] + dist * ce * Math.cos(f.azimuth),
    ];
    const proj = perspective(FOV, aspect, Math.max(1, dist - 30), dist + 30);
    // Lens shift: move the image without turning the camera, like a view camera.
    proj[8] = -shiftX;
    proj[9] = -shiftY;
    return { vp: mul(proj, lookAt(eye, target, [0, 1, 0])), eye };
  }

  render(f: Frame): Projection | null {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || !this.palette) return null;
    const P = this.palette;
    const pose = this.pose(f.explode);

    // Instance data.
    this.crown.data.set(pose.crown, 0);
    pose.cutters.forEach((c, k) => this.cutters.data.set(c.m, k * 16));
    pose.nozzles.forEach((n, k) => this.nozzles.data.set(n.m, k * 16));
    for (const g of [this.crown, this.cutters, this.nozzles]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, g.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, g.data);
    }
    this.writeLines(pose);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // 1 — shadow map, only when something moved.
    if (Math.abs(f.explode - this.lastShadowExplode) > 1e-5) {
      this.lastShadowExplode = f.explode;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      gl.useProgram(this.progDepth);
      gl.uniformMatrix4fv(this.u(this.progDepth, "u_lvp"), false, this.lightVP);
      for (const g of [this.shank, this.crown, this.cutters, this.nozzles]) {
        gl.bindVertexArray(g.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0, g.instances);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    const { vp, eye } = this.camera(f, pose.crownK);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);

    const roles = this.roles(P);

    // 2 — ground, blended over the page.
    gl.useProgram(this.progGround);
    const pg = this.progGround;
    gl.uniformMatrix4fv(this.u(pg, "u_vp"), false, vp);
    gl.uniformMatrix4fv(this.u(pg, "u_lvp"), false, this.lightVP);
    gl.uniform1i(this.u(pg, "u_shadow"), 0);
    gl.uniform2f(this.u(pg, "u_texel"), 1 / SHADOW, 1 / SHADOW);
    gl.uniform3fv(this.u(pg, "u_ink"), roles.shadow);
    gl.uniform3fv(this.u(pg, "u_line"), roles.line);
    gl.uniform1f(this.u(pg, "u_shadowA"), roles.shadowA);
    gl.uniform1f(this.u(pg, "u_ringA"), roles.ringA);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindVertexArray(this.ground.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.ground.count);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // 3 — the parts.
    const pm = this.progMain;
    gl.useProgram(pm);
    gl.uniformMatrix4fv(this.u(pm, "u_vp"), false, vp);
    gl.uniformMatrix4fv(this.u(pm, "u_lvp"), false, this.lightVP);
    gl.uniform1i(this.u(pm, "u_shadow"), 0);
    gl.uniform2f(this.u(pm, "u_texel"), 1 / SHADOW, 1 / SHADOW);
    gl.uniform3fv(this.u(pm, "u_cam"), eye);
    gl.uniform3fv(this.u(pm, "u_L"), LIGHT);
    for (const [k, v] of Object.entries(roles.main)) gl.uniform3fv(this.u(pm, k), v as RGB);
    gl.uniform1f(this.u(pm, "u_lineA"), roles.lineA);
    gl.uniform1f(this.u(pm, "u_rimA"), roles.rimA);
    gl.uniform1f(this.u(pm, "u_shadowFloor"), roles.shadowFloor);
    for (const g of [this.shank, this.crown, this.cutters, this.nozzles]) {
      gl.bindVertexArray(g.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0, g.instances);
    }

    // 4 — centreline and explode traces.
    const pl = this.progLine;
    gl.useProgram(pl);
    gl.uniformMatrix4fv(this.u(pl, "u_vp"), false, vp);
    gl.uniform3fv(this.u(pl, "u_line"), roles.trace);
    gl.bindVertexArray(this.lines.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.lines.count, gl.UNSIGNED_INT, 0, this.lines.instances);
    gl.bindVertexArray(null);

    return this.projectAnchors(vp, pose);
  }

  /** Colour roles, every one derived from a KOC semantic token. */
  private roles(P: Palette) {
    const dark = P.dark;
    const ink: RGB = dark ? P.background : P.foreground;
    const clay = dark ? mix(P.card, P.mutedForeground, 0.42) : mix(P.card, P.background, 0.45);
    const white = dark ? P.foreground : P.card;
    return {
      main: {
        u_clay: clay,
        u_prim: P.primary,
        u_face: mix(P.primary, white, dark ? 0.25 : 0.42),
        u_ink: mix(ink, P.primary, 0.12),
        u_sky: mix(mix(white, P.primary, 0.1), [0, 0, 0], dark ? 0.35 : 0.42),
        // Bounce light. On the dark mapping the floor is near-black, so a
        // surface facing down would read as a hole: bounce the dial's blue instead.
        u_gnd: dark
          ? mix(mix(P.mutedForeground, P.primary, 0.35), [0, 0, 0], 0.5)
          : mix(mix(P.background, ink, 0.25), [0, 0, 0], 0.62),
        u_key: mix(white, [0, 0, 0], dark ? 0.35 : 0.46),
        u_rim: P.background,
        u_line: P.primary,
      },
      lineA: dark ? 0.3 : 0.2,
      rimA: dark ? 0.55 : 0.4,
      // Dark ambient is low, so a shadow there reads as a hole unless lifted.
      shadowFloor: dark ? 0.5 : 0.3,
      shadow: mix(ink, P.primary, 0.15),
      shadowA: dark ? 0.5 : 0.16,
      line: P.primary,
      ringA: dark ? 0.38 : 0.26,
      trace: mix(P.primary, P.background, 0.15),
    };
  }

  private writeLines(pose: ReturnType<PlateRenderer["pose"]>) {
    const d = this.lines.data;
    let k = 0;
    const put = (a: V3, b: V3, kind: number) => {
      const dir = sub(b, a);
      const l = len(dir);
      if (l < 0.02) {
        // Park it: zero-length segments draw nothing.
        d.set(basis([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, -1000, 0]), k * 16);
      } else {
        const y = scale(dir, 1 / l);
        const x = norm(Math.abs(y[1]) > 0.9 ? cross(y, [1, 0, 0]) : cross(y, [0, 1, 0]));
        const z = cross(x, y);
        d.set(basis(scale(x, LINE_R), dir, scale(z, LINE_R), a), k * 16);
        d[k * 16 + 3] = kind;
      }
      k++;
    };
    // Centreline through the whole stack.
    put([0, -1.2, 0], [0, 14.9 + pose.lift + 0.8, 0], 0);
    this.model.cutters.forEach((c, i) => {
      const seat: V3 = [c.m[12], c.m[13] + pose.lift, c.m[14]];
      const now = pose.cutters[i].m;
      put(seat, [now[12], now[13], now[14]], 1);
    });
    this.model.nozzles.forEach((n, i) => {
      const seat: V3 = [n.m[12], n.m[13] + pose.lift, n.m[14]];
      const now = pose.nozzles[i].m;
      put(seat, [now[12], now[13], now[14]], 1);
    });
    // The weld line's travel, down the shank's side.
    put([D0.x, D0.y, D0.z], [D0.x, D0.y + pose.lift, D0.z], 1);
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lines.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
  }

  private projectAnchors(vp: M4, pose: ReturnType<PlateRenderer["pose"]>): Projection {
    const toScreen = (p: V3): ScreenPoint => {
      const c = project(vp, p);
      return { x: (c[0] / c[3] * 0.5 + 0.5) * this.cssW, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * this.cssH };
    };
    const anchors = {} as Record<CalloutId, ScreenPoint>;
    for (const [id, a] of Object.entries(this.model.anchors) as [CalloutId, Anchor][]) {
      let w: V3;
      if (a.part === "shank") w = a.p;
      else if (a.part === "crown") w = transformPoint(pose.crown, a.p);
      else if (a.part === "cutter") w = transformPoint(pose.cutters[a.index!].m, a.p);
      else w = transformPoint(pose.nozzles[a.index!].m, a.p);
      anchors[id] = toScreen(w);
    }
    const right = toScreen([4.6, 9 + pose.lift, 0]).x;
    const top = toScreen([0, 14.2 + pose.lift, 0]).y;
    const bottom = toScreen([0, 0, 0]).y;
    return { anchors, right, top, bottom };
  }

  /**
   * Free every GL object, but leave the context alone: under StrictMode the
   * same canvas is mounted again immediately, and `getContext` hands back the
   * same context — lose it here and the second mount draws into a dead one.
   * The caller releases the context once the canvas has really left the page.
   */
  dispose() {
    const gl = this.gl;
    this.gl = null;
    if (!gl || gl.isContextLost()) return;
    for (const g of [this.shank, this.crown, this.cutters, this.nozzles, this.lines]) {
      gl.deleteVertexArray(g.vao);
      gl.deleteBuffer(g.inst);
    }
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    gl.deleteVertexArray(this.ground.vao);
    for (const p of [this.progMain, this.progDepth, this.progGround, this.progLine]) gl.deleteProgram(p);
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFbo);
  }
}

/** Where the crown-lift trace runs: the front of the weld line. */
const D0 = { x: 0, y: 7.6, z: 2.88 };
