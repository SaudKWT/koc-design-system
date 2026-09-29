/**
 * Raw WebGL2 renderer for the diorama. No three.js — zero new dependencies.
 *
 * Passes, in order:
 *   1. shadow   — depth from the sun, orthographic, fitted to the active chapter
 *   2. sky      — full-screen gradient; the SAME function the fog samples, so
 *                 objects dissolve into exactly the colour behind them
 *   3. scene    — matte wrapped-Lambert, hemispheric ambient, 5×5 PCF, height fog
 *   4. overlay  — the horizon light-streak, its glint, and a soft vignette
 *
 * Everything is linear-light internally and encoded to sRGB on output.
 */

import type { MeshData } from "./geometry";
import type { Anim } from "./anims";
import { m4, v3, type M4, type V3 } from "./math";

export type Rgb = [number, number, number];

export interface Palette {
  dark: boolean;
  zenith: Rgb;
  horizon: Rgb;
  left: Rgb;
  right: Rgb;
  floor: Rgb;
  albedoDark: Rgb;
  albedoLight: Rgb;
  accent: Rgb;
  sun: Rgb;
  ambSky: Rgb;
  ambGround: Rgb;
  streak: Rgb;
  vignette: Rgb;
}

export interface DrawItem {
  mesh: MeshData;
  /** 16 floats per instance (column-major). Absent = a single draw. */
  instances?: Float32Array;
  /** When set, overrides per-vertex material for every instance. */
  instMat?: [number, number];
  kind?: 0 | 1 | 2; // 0 standard · 1 terrain · 2 water
  center: V3;
  radius: number;
  castShadow?: boolean;
  /** Animated transform, evaluated per frame. Hydrated from `anim` on the main thread. */
  model?: (t: number) => M4;
  /** Serialisable description of the animation (functions cannot leave a worker). */
  anim?: Anim;
}

export interface Frame {
  eye: V3;
  target: V3;
  fovY: number;
  time: number;
  /** Where the shadow frustum is centred (the active chapter). */
  shadowCenter: V3;
  /** Metres from the camera before distance fog begins. */
  fogStart: number;
  /** 0 = clear; >0 thickens fog (the wipe between chapters). */
  fogBoost: number;
  /** World point the light-streak's glint sits on. */
  streakAnchor: V3;
  streakIntensity: number;
}

const SHADOW_SIZE = 2048;
const SHADOW_HALF = 95;

// ── GLSL ───────────────────────────────────────────────────────────────────

const COMMON = /* glsl */ `
uniform vec3 u_zenith, u_horizon, u_left, u_right, u_floor, u_camRight, u_cam;
uniform float u_fogDensity, u_fogFalloff, u_fogStart, u_fogDist, u_fogBoost, u_time;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 17.1) + 0.125 * vnoise(p * 4.12 + 31.7);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
vec3 sky(vec3 rd) {
  float h = rd.y;
  float side = dot(rd, u_camRight);
  vec3 c = mix(u_left, u_right, smoothstep(-0.75, 0.75, side));
  c = mix(c, u_horizon, exp(-abs(h - 0.02) * 9.0) * 0.55);
  c = mix(c, u_zenith, smoothstep(0.04, 0.75, h));
  c = mix(c, u_floor, smoothstep(-0.02, -0.5, h) * 0.6);
  return c;
}

float fogAmount(vec3 ro, vec3 rd, float t) {
  float b = u_fogFalloff;
  float k = rd.y * b;
  float e0 = exp(-b * ro.y);
  float fh = abs(k) < 1e-4 ? e0 * t : e0 * (1.0 - exp(-k * t)) / k;
  float dens = u_fogDensity * fh + u_fogDist * max(t - u_fogStart, 0.0);
  // Drifting patches: the fog is never quite still, and never quite even.
  vec3 hit = ro + rd * t;
  float patchy = fbm3(hit.xz * 0.012 + vec2(u_time * 0.018, u_time * 0.007));
  dens *= 0.6 + 1.03 * patchy;
  return 1.0 - exp(-dens * (1.0 + u_fogBoost));
}

vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
`;

const SCENE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_mat;
layout(location=3) in vec4 i_c0;
layout(location=4) in vec4 i_c1;
layout(location=5) in vec4 i_c2;
layout(location=6) in vec4 i_c3;
uniform mat4 u_viewProj, u_model, u_light;
uniform float u_useInstMat;
uniform vec2 u_instMat;
out vec3 v_world;
out vec3 v_nrm;
out vec2 v_mat;
out vec4 v_lpos;
void main() {
  mat4 M = u_model * mat4(i_c0, i_c1, i_c2, i_c3);
  vec4 w = M * vec4(a_pos, 1.0);
  vec3 c0 = M[0].xyz, c1 = M[1].xyz, c2 = M[2].xyz;
  vec3 s2 = vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2));
  vec3 n = normalize(mat3(M) * (a_nrm / s2));
  v_nrm = n;
  v_world = w.xyz;
  v_mat = mix(a_mat, u_instMat, u_useInstMat);
  v_lpos = u_light * vec4(w.xyz + n * 0.05, 1.0);
  gl_Position = u_viewProj * w;
}`;

const SCENE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 v_world;
in vec3 v_nrm;
in vec2 v_mat;
in vec4 v_lpos;
uniform sampler2DShadow u_shadow;
uniform vec3 u_sunDir, u_sunCol, u_ambSky, u_ambGround, u_albDark, u_albLight, u_accent;
uniform int u_kind;
uniform float u_texel;
out vec4 o;
${COMMON}

float shadowAt(vec4 lp) {
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.z >= 1.0 || p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0) return 1.0;
  // 3×3 taps of hardware-filtered compares, spread 1.6 texels: soft, and a
  // third of the cost of 5×5.
  float s = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      s += texture(u_shadow, vec3(p.xy + vec2(x, y) * u_texel * 1.6, p.z - 0.0006));
  return s / 9.0;
}

void main() {
  vec3 N = normalize(v_nrm);
  vec3 alb = mix(u_albDark, u_albLight, v_mat.x);
  alb = mix(alb, u_accent, v_mat.y);

  vec3 V = v_world - u_cam;
  float dist = length(V);
  vec3 rd = V / dist;

  if (u_kind == 1) {
    // Sand: slow tonal drift, fine grain, and wind ripples bent by the drift.
    vec2 q = v_world.xz;
    float n = fbm(q * 0.045);
    float grain = vnoise(q * 9.0) * 0.5 + vnoise(q * 23.0) * 0.5;
    float rip = sin(dot(q, vec2(0.9, 0.42)) * 2.2 + n * 9.0);
    float fade = exp(-dist * 0.012);
    alb *= 0.9 + 0.22 * (n - 0.5) + (grain - 0.5) * 0.12 * fade;
    vec2 g = vec2(0.9, 0.42) * cos(dot(q, vec2(0.9, 0.42)) * 2.2 + n * 9.0) * 0.05 * fade;
    N = normalize(N + vec3(g.x, 0.0, g.y) * (0.6 + 0.4 * rip));
  }

  if (u_kind == 2) {
    // Water: drifting noise ripples, faded with distance so they never band
    // into stripes; fresnel to the sky it reflects.
    vec2 q = v_world.xz;
    float t = u_time;
    float fadeW = exp(-dist * 0.006);
    vec2 g = vec2(0.0);
    for (int i = 0; i < 3; i++) {
      float sc = 0.35 * pow(2.1, float(i));
      vec2 off = vec2(t * 0.25, -t * 0.18) * (1.0 + float(i) * 0.4);
      float e = 0.35;
      float h0 = vnoise(q * sc + off);
      g += vec2(vnoise((q + vec2(e, 0.0)) * sc + off) - h0, vnoise((q + vec2(0.0, e)) * sc + off) - h0) / e / sc * 0.22 / float(i + 1);
    }
    g *= fadeW;
    vec3 Nw = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 r = reflect(rd, Nw);
    r.y = abs(r.y);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, Nw), 0.0), 5.0);
    vec3 deep = mix(u_albDark, u_accent, 0.35) * (u_ambSky * 0.6);
    vec3 col = mix(deep, sky(r), clamp(fr * 1.2 + 0.25, 0.0, 1.0));
    float sh = shadowAt(v_lpos);
    col *= 0.75 + 0.25 * sh;
    float f = fogAmount(u_cam, rd, dist);
    col = mix(col, sky(rd), f);
    o = vec4(toSrgb(col) + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
    return;
  }

  float ndl = dot(N, u_sunDir);
  float diff = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
  float sh = shadowAt(v_lpos);
  vec3 amb = mix(u_ambGround, u_ambSky, N.y * 0.5 + 0.5);
  // Rim of fog-light on silhouettes — the diorama glows at its edges.
  float rim = pow(1.0 - max(dot(-rd, N), 0.0), 3.0) * 0.18;
  vec3 col = alb * (amb + u_sunCol * diff * mix(0.25, 1.0, sh)) + sky(rd) * rim;

  float f = fogAmount(u_cam, rd, dist);
  col = mix(col, sky(rd), f);
  o = vec4(toSrgb(col) + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}`;

const SHADOW_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=3) in vec4 i_c0;
layout(location=4) in vec4 i_c1;
layout(location=5) in vec4 i_c2;
layout(location=6) in vec4 i_c3;
uniform mat4 u_light, u_model;
void main() { gl_Position = u_light * u_model * mat4(i_c0, i_c1, i_c2, i_c3) * vec4(a_pos, 1.0); }`;

const SHADOW_FS = /* glsl */ `#version 300 es
precision mediump float;
void main() {}`;

const FULL_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}`;

const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform mat4 u_invViewProj;
out vec4 o;
${COMMON}
void main() {
  vec4 p = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(p.xyz / p.w - u_cam);
  vec3 c = sky(rd);
  // Low cloud-like haze drifting across the horizon.
  float haze = fbm(vec2(atan(rd.x, rd.z) * 3.0, rd.y * 14.0)) ;
  c = mix(c, u_horizon, (haze - 0.5) * 0.25 * exp(-abs(rd.y) * 6.0));
  o = vec4(toSrgb(c) + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}`;

const OVERLAY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res, u_anchor;
uniform float u_dpr, u_time, u_intensity, u_vigAmt;
uniform vec3 u_streak, u_vignette;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy;
  float dy = abs(p.y - u_anchor.y) / u_dpr;
  float dx = (p.x - u_anchor.x) / u_dpr;
  float w = u_res.x / u_dpr;
  float core = exp(-dy * dy * 1.1);
  float halo = exp(-dy * 0.22) * 0.16;
  float along = mix(0.28, 1.0, exp(-abs(dx) / (w * 0.22)));
  // A travelling shimmer along the line, very slow.
  float shimmer = 0.85 + 0.15 * sin(dx * 0.012 - u_time * 0.6);
  float glint = exp(-length(vec2(dx * 0.09, dy * 0.55))) * (0.9 + 0.1 * sin(u_time * 2.1));
  float flare = exp(-abs(dy) * 0.9) * exp(-abs(dx) / 90.0) * 0.5;
  float line = (core * 0.75 + halo) * along * shimmer + glint * 1.2 + flare;
  vec3 add = pow(u_streak, vec3(1.0 / 2.2)) * line * u_intensity;
  vec2 uv = p / u_res;
  float v = smoothstep(0.42, 1.05, length((uv - 0.5) * vec2(1.0, 0.85))) * u_vigAmt;
  o = vec4(add + pow(u_vignette, vec3(1.0 / 2.2)) * v, v);
}`;

// ── Renderer ───────────────────────────────────────────────────────────────

interface GpuItem {
  item: DrawItem;
  vao: WebGLVertexArrayObject;
  shadowVao: WebGLVertexArrayObject;
  count: number;
  instances: number;
  buffers: WebGLBuffer[];
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  const uni = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u: (name: string) => {
      if (!uni.has(name)) uni.set(name, gl.getUniformLocation(p, name));
      return uni.get(name)!;
    },
  };
}

/** SwiftShader, llvmpipe, Microsoft Basic Render Driver and friends. */
export function isSoftwareGL(gl: WebGL2RenderingContext): boolean {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private scene;
  private shadowProg;
  private sky;
  private overlay;
  private items: GpuItem[] = [];
  private shadowTex: WebGLTexture;
  private shadowFbo: WebGLFramebuffer;
  private emptyVao: WebGLVertexArrayObject;
  palette!: Palette;
  width = 1;
  height = 1;
  dpr = 1;
  /** Last frame's view-projection, for projecting hotspots onto the page. */
  viewProj: M4 = m4.identity();
  /** Low side-back sun, so shadows rake toward the camera instead of hiding behind what casts them. */
  sunDir: V3 = v3.norm([0.72, 0.5, -0.35]);
  /** Height fog (density at y=0, falloff per metre) and distance fog per metre past fogStart. */
  fog = { density: 0.0055, falloff: 0.26, dist: 0.0028 };

  constructor(private canvas: HTMLCanvasElement, items: DrawItem[]) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    if (isSoftwareGL(gl)) {
      // A software rasteriser (VDI, RDP, a blocklisted driver, headless CI)
      // takes seconds per frame of this scene and freezes the page. The
      // caller shows the drawn fallback instead.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      throw new Error("Software WebGL renderer");
    }
    this.gl = gl;
    this.scene = compile(gl, SCENE_VS, SCENE_FS);
    this.shadowProg = compile(gl, SHADOW_VS, SHADOW_FS);
    this.sky = compile(gl, FULL_VS, SKY_FS);
    this.overlay = compile(gl, FULL_VS, OVERLAY_FS);
    this.emptyVao = gl.createVertexArray()!;

    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
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

    // Non-instanced draws read the instance matrix from constant attributes:
    // identity columns. Constant attribute values are context state, not VAO
    // state, so this is set once.
    gl.vertexAttrib4f(3, 1, 0, 0, 0);
    gl.vertexAttrib4f(4, 0, 1, 0, 0);
    gl.vertexAttrib4f(5, 0, 0, 1, 0);
    gl.vertexAttrib4f(6, 0, 0, 0, 1);

    for (const it of items) this.items.push(this.upload(it));
  }

  private upload(item: DrawItem): GpuItem {
    const gl = this.gl;
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, item.mesh.vertices, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    const buffers = [vbo, ibo];
    let ibuf: WebGLBuffer | null = null;
    if (item.instances) {
      ibuf = gl.createBuffer()!;
      buffers.push(ibuf);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, item.instances, gl.STATIC_DRAW);
    }
    const make = (full: boolean) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      if (full) {
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      }
      if (ibuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
        for (let c = 0; c < 4; c++) {
          gl.enableVertexAttribArray(3 + c);
          gl.vertexAttribPointer(3 + c, 4, gl.FLOAT, false, 64, c * 16);
          gl.vertexAttribDivisor(3 + c, 1);
        }
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bindVertexArray(null);
      return vao;
    };
    const vao = make(true);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.mesh.indices, gl.STATIC_DRAW);
    const shadowVao = make(false);
    return {
      item,
      vao,
      shadowVao,
      count: item.mesh.indices.length,
      instances: item.instances ? item.instances.length / 16 : 0,
      buffers,
    };
  }

  /** Upload more items after construction — chapters are built progressively. */
  add(items: DrawItem[]) {
    if (this.gl.isContextLost()) return;
    for (const it of items) this.items.push(this.upload(it));
  }

  get triangleCount() {
    return this.items.reduce((n, g) => n + (g.count / 3) * Math.max(1, g.instances), 0);
  }

  setPalette(p: Palette) {
    this.palette = p;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  render(f: Frame) {
    const gl = this.gl;
    const P = this.palette;
    if (!P || gl.isContextLost()) return;
    const aspect = this.width / this.height;
    const proj = m4.perspective(f.fovY, aspect, 0.5, 2600);
    const view = m4.lookAt(f.eye, f.target);
    const vp = m4.mul(proj, view);
    this.viewProj = vp;
    const fwd = v3.norm(v3.sub(f.target, f.eye));
    const right = v3.norm(v3.cross(fwd, [0, 1, 0]));

    // Light frustum, snapped to whole shadow texels so edges do not crawl.
    const texelWorld = (SHADOW_HALF * 2) / SHADOW_SIZE;
    const lview0 = m4.lookAt(v3.add(f.shadowCenter, v3.scale(this.sunDir, 300)), f.shadowCenter);
    const cLs = m4.transformPoint(lview0, f.shadowCenter);
    const snapX = Math.round(cLs[0] / texelWorld) * texelWorld - cLs[0];
    const snapY = Math.round(cLs[1] / texelWorld) * texelWorld - cLs[1];
    const lproj = m4.ortho(-SHADOW_HALF + snapX, SHADOW_HALF + snapX, -SHADOW_HALF + snapY, SHADOW_HALF + snapY, 1, 700);
    const light = m4.mul(lproj, lview0);

    const visible = this.items.filter((g) => {
      const d = v3.len(v3.sub(g.item.center, f.eye)) - g.item.radius;
      return d < f.fogStart + 420;
    });

    // 1 · shadow
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.6, 3.0);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.shadowProg.p);
    gl.uniformMatrix4fv(this.shadowProg.u("u_light"), false, light);
    for (const g of visible) {
      if (!g.item.castShadow) continue;
      const sc = v3.len(v3.sub(g.item.center, f.shadowCenter)) - g.item.radius;
      if (sc > SHADOW_HALF * 1.6) continue;
      gl.uniformMatrix4fv(this.shadowProg.u("u_model"), false, g.item.model ? g.item.model(f.time) : m4.identity());
      gl.bindVertexArray(g.shadowVao);
      if (g.instances) gl.drawElementsInstanced(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0, g.instances);
      else gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2 · sky
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.sky.p);
    this.common(this.sky, f, right);
    gl.uniformMatrix4fv(this.sky.u("u_invViewProj"), false, m4.invert(vp));
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3 · scene
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    const s = this.scene;
    gl.useProgram(s.p);
    this.common(s, f, right);
    gl.uniformMatrix4fv(s.u("u_viewProj"), false, vp);
    gl.uniformMatrix4fv(s.u("u_light"), false, light);
    gl.uniform3fv(s.u("u_sunDir"), this.sunDir);
    gl.uniform3fv(s.u("u_sunCol"), P.sun);
    gl.uniform3fv(s.u("u_ambSky"), P.ambSky);
    gl.uniform3fv(s.u("u_ambGround"), P.ambGround);
    gl.uniform3fv(s.u("u_albDark"), P.albedoDark);
    gl.uniform3fv(s.u("u_albLight"), P.albedoLight);
    gl.uniform3fv(s.u("u_accent"), P.accent);
    gl.uniform1f(s.u("u_texel"), 1 / SHADOW_SIZE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(s.u("u_shadow"), 0);
    for (const g of visible) {
      const it = g.item;
      gl.uniform1i(s.u("u_kind"), it.kind ?? 0);
      gl.uniformMatrix4fv(s.u("u_model"), false, it.model ? it.model(f.time) : m4.identity());
      gl.uniform1f(s.u("u_useInstMat"), it.instMat ? 1 : 0);
      gl.uniform2fv(s.u("u_instMat"), it.instMat ?? [0, 0]);
      gl.bindVertexArray(g.vao);
      if (g.instances) gl.drawElementsInstanced(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0, g.instances);
      else gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
    }

    // 4 · overlay (premultiplied: glow adds, vignette leans toward its colour)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const o = this.overlay;
    gl.useProgram(o.p);
    const a = this.project(f.streakAnchor);
    gl.uniform2f(o.u("u_res"), this.width, this.height);
    gl.uniform2f(o.u("u_anchor"), a ? a[0] * this.dpr : this.width / 2, a ? this.height - a[1] * this.dpr : this.height / 2);
    gl.uniform1f(o.u("u_dpr"), this.dpr);
    gl.uniform1f(o.u("u_time"), f.time);
    gl.uniform1f(o.u("u_intensity"), f.streakIntensity);
    gl.uniform1f(o.u("u_vigAmt"), P.dark ? 0.35 : 0.22);
    gl.uniform3fv(o.u("u_streak"), P.streak);
    gl.uniform3fv(o.u("u_vignette"), P.vignette);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private common(prog: ReturnType<typeof compile>, f: Frame, right: V3) {
    const gl = this.gl;
    const P = this.palette;
    gl.uniform3fv(prog.u("u_zenith"), P.zenith);
    gl.uniform3fv(prog.u("u_horizon"), P.horizon);
    gl.uniform3fv(prog.u("u_left"), P.left);
    gl.uniform3fv(prog.u("u_right"), P.right);
    gl.uniform3fv(prog.u("u_floor"), P.floor);
    gl.uniform3fv(prog.u("u_camRight"), right);
    gl.uniform3fv(prog.u("u_cam"), f.eye);
    gl.uniform1f(prog.u("u_fogDensity"), this.fog.density);
    gl.uniform1f(prog.u("u_fogFalloff"), this.fog.falloff);
    gl.uniform1f(prog.u("u_fogStart"), f.fogStart);
    gl.uniform1f(prog.u("u_fogDist"), this.fog.dist);
    gl.uniform1f(prog.u("u_fogBoost"), f.fogBoost);
    gl.uniform1f(prog.u("u_time"), f.time);
  }

  /** World → CSS pixels (top-left origin). Null when behind the camera. */
  project(p: V3): [number, number] | null {
    const m = this.viewProj;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) return null;
    const cw = this.width / this.dpr, ch = this.height / this.dpr;
    return [((x / w) * 0.5 + 0.5) * cw, (1 - ((y / w) * 0.5 + 0.5)) * ch];
  }

  dispose() {
    const gl = this.gl;
    for (const g of this.items) {
      gl.deleteVertexArray(g.vao);
      gl.deleteVertexArray(g.shadowVao);
      for (const b of g.buffers) gl.deleteBuffer(b);
    }
    this.items = [];
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFbo);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteProgram(this.scene.p);
    gl.deleteProgram(this.shadowProg.p);
    gl.deleteProgram(this.sky.p);
    gl.deleteProgram(this.overlay.p);
  }
}
