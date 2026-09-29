/**
 * The well scene: raw WebGL2, no library (zero new dependencies — KOC's
 * cybersecurity approval freezes whatever ships).
 *
 * Two vertex paths share one physically-based fragment shader:
 *   PATH  — anything downhole. Vertices are in a part's local frame and are
 *           mapped onto the well path in the shader, with a radial
 *           exaggeration so the same meshes serve the 5,000 ft well plan and
 *           the arm's-length bit. The string can spin and lie on the low side.
 *   WORLD — the rig and the planes, as instanced unit boxes and cylinders.
 *
 * Every colour comes from a KOC token read at runtime — no hex is written
 * here (invariant 1). Motion is rAF-driven, stops under reduced motion, when
 * paused, when the hero is off screen and when the tab is hidden.
 */

import { Geo, unitBox, unitCylinder } from "./geometry";
import { type M4, type V3, DEG, add, clamp, easeInOut, lerp, lerp3, lookAt, multiply, perspective, project, scale, smooth } from "./math";
import { BHA, CASING, FORMATIONS, H, LANDING_MD, OPEN_HOLE, RKB, TD, station } from "./well";
import {
  PAD_ANGLES,
  PAD_MAX_PUSH,
  bhaPart,
  coupling,
  couplingInstances,
  dpInstances,
  dpJoint,
  floatShoe,
  hwdpJoint,
  partInstance,
  pdcBit,
  rssPad,
  shoeInstance,
} from "./downhole";
import { RIG_MATS, buildRig, type RigMat } from "./rig";
import { CHAPTERS, LABELS, type Cam } from "./chapters";

/* ------------------------------------------------------------------------ */
/* Shaders                                                                   */

const PATH_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aLocal;
layout(location=1) in vec3 aLocalN;
layout(location=2) in float aMat;
layout(location=3) in vec4 aFrame;
layout(location=4) in float aMd;
uniform mat4 uVP;
uniform vec3 uH;
uniform float uExag;
uniform float uSpin;
uniform vec3 uPush;
uniform vec4 uOffset;
uniform int uCuttings;
uniform vec4 uCut;      // md range start, end; annulus r in, r out (ft)
uniform float uTime;
uniform vec3 uLat0;     // lateral origin (landing) and its MD in .w of uLatMd
uniform float uLatMd;
out vec3 vWorld;
out vec3 vNormal;
out float vMat;
out float vMd;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  vec3 local = aLocal;
  vec3 ln = aLocalN;
  vec3 center = aFrame.xyz;
  float inc = aFrame.w;
  float md = aMd;

  if (uCuttings == 1) {
    // Instance: (md0, angle, radial fraction, seed), size in aMd.
    float seed = aFrame.w;
    float speed = mix(0.0, 1.6, step(0.0, seed)) * (0.6 + 0.8 * fract(abs(seed) * 7.31));
    float span = uCut.y - uCut.x;
    md = uCut.x + mod(aFrame.x - uTime * speed - uCut.x, span);
    inc = 1.5707963;
    center = uLat0 + uH * (md - uLatMd);
    float tumble = uTime * speed * 3.0 + abs(seed) * 40.0;
    local = local * aMd;
    local.xy = rot(tumble) * local.xy;
    local.yz = rot(tumble * 0.7) * local.yz;
    ln.xy = rot(tumble) * ln.xy;
    ln.yz = rot(tumble * 0.7) * ln.yz;
    float r = mix(uCut.z, uCut.w, aFrame.z);
    local.yz += vec2(cos(aFrame.y), sin(aFrame.y)) * r;
  } else {
    local.yz += uPush.xy * uPush.z;
    mat2 R = rot(uSpin);
    local.yz = R * local.yz;
    ln.yz = R * ln.yz;
    float off = mix(uOffset.x, uOffset.y, smoothstep(uOffset.z, uOffset.w, md + local.x));
    local.y += off * smoothstep(0.0, 0.35, inc);
  }

  vec3 T = uH * sin(inc) - vec3(0.0, 1.0, 0.0) * cos(inc);
  vec3 N = -uH * cos(inc) - vec3(0.0, 1.0, 0.0) * sin(inc);
  vec3 B = cross(T, N);
  vec3 p = center + T * local.x + (N * local.y + B * local.z) * uExag;
  vNormal = normalize(T * ln.x * uExag + N * ln.y + B * ln.z);
  vWorld = p;
  vMat = aMat;
  vMd = md + local.x;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const WORLD_VS = /* glsl */ `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in float aMat;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
uniform mat4 uVP;
out vec3 vWorld;
out vec3 vNormal;
out float vMat;
out float vMd;
void main() {
  mat4 M = mat4(aM0, aM1, aM2, aM3);
  vec4 w = M * vec4(aPos, 1.0);
  vec3 c0 = aM0.xyz, c1 = aM1.xyz, c2 = aM2.xyz;
  vNormal = normalize(c0 * aNrm.x / dot(c0, c0) + c1 * aNrm.y / dot(c1, c1) + c2 * aNrm.z / dot(c2, c2));
  vWorld = w.xyz;
  vMat = aMat;
  vMd = -1.0;
  gl_Position = uVP * w;
}`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in float vMat;
in float vMd;
uniform vec3 uColor[4];
uniform vec2 uMR[4];
uniform int uMode;        // 0 lit, 1 glass, 2 ground dots, 3 strata plane, 4 unlit
uniform float uAlpha;
uniform float uFacing;    // glass: -1 back faces only, 1 front faces only
uniform vec3 uCam;
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol;
uniform vec3 uEnvTop, uEnvBot, uEnvStrip;
uniform vec3 uInk, uPaper, uAccent;
uniform float uFogNear, uFogFar;
uniform float uGrid;
uniform vec3 uFocus;      // ground fade centre
uniform float uFade;      // ground fade radius
uniform float uTops[6];   // formation tops, TVD ft; [5] = section bottom
uniform float uRkb;
out vec4 frag;

const float PI = 3.14159265;

vec3 env(vec3 d, float rough) {
  float h = d.y;
  vec3 c = mix(uEnvBot, uEnvTop, smoothstep(-0.7, 0.9, h));
  float w = mix(0.035, 0.55, rough);
  float k = 1.0 - rough * 0.75;
  c += uEnvStrip * k * (smoothstep(w, 0.0, abs(h - 0.42)) + 0.35 * smoothstep(w * 1.6, 0.0, abs(h + 0.08)));
  float az = atan(d.z, d.x);
  c += uEnvStrip * 0.55 * k * smoothstep(w * 1.6, 0.0, abs(sin(az - 0.9))) * smoothstep(-0.1, 0.5, h);
  return c;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 lit(vec3 base, float metal, float rough, vec3 N, vec3 V) {
  float a = max(0.02, rough * rough);
  vec3 F0 = mix(vec3(0.04), base, metal);
  float NdV = max(dot(N, V), 1e-3);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 L = normalize(i == 0 ? uKeyDir : uFillDir);
    vec3 lc = i == 0 ? uKeyCol : uFillCol;
    vec3 Hh = normalize(L + V);
    float NdL = max(dot(N, L), 0.0);
    float NdH = max(dot(N, Hh), 0.0);
    float VdH = max(dot(V, Hh), 0.0);
    float a2 = a * a;
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float kk = a * 0.5;
    float Vis = 0.25 / ((NdV * (1.0 - kk) + kk) * (NdL * (1.0 - kk) + kk));
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
    col += ((1.0 - F) * (1.0 - metal) * base / PI + D * Vis * F) * lc * NdL;
  }
  vec3 R = reflect(-V, N);
  vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
  col += env(R, rough) * Fe;
  col += base * (1.0 - metal) * mix(uEnvBot, uEnvTop, N.y * 0.5 + 0.5) * 0.85;
  return col;
}

void main() {
  vec3 V = normalize(uCam - vWorld);
  float dist = length(uCam - vWorld);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, dist);
  int m = int(vMat + 0.5);
  vec3 base = uColor[m];
  vec2 mr = uMR[m];
  vec3 N = normalize(vNormal);

  if (uMode == 2) {
    // The ground: a fine dot field that fades out around the pad.
    vec2 p = vWorld.xz / uGrid;
    float d = length(abs(fract(p) - 0.5));
    float aa = fwidth(d) * 1.2;
    float dotm = 1.0 - smoothstep(0.045 - aa, 0.045 + aa, d);
    float edge = smoothstep(uFade, uFade * 0.35, length(vWorld.xz - uFocus.xz));
    float a = (dotm * 0.5 + 0.02) * edge * uAlpha * fog;
    frag = vec4(uInk * a, a);
    return;
  }

  if (uMode == 3) {
    // The geological section behind the well plan: formation bands, 1 px
    // tops, a ground line and a 1,000 ft grid — widths held in pixels by fwidth.
    float tvd = uRkb - vWorld.y;
    float x = vWorld.x;
    float wt = fwidth(tvd);
    float wx = fwidth(x);
    float band = -1.0;
    for (int i = 0; i < 5; i++) if (tvd >= uTops[i]) band = float(i);
    float fill = band < 0.0 ? 0.0 : (mod(band, 2.0) < 0.5 ? 0.075 : 0.04);
    if (tvd > uTops[5]) fill = 0.0;
    float line = 0.0;
    for (int i = 0; i < 5; i++) line = max(line, 1.0 - smoothstep(wt * 0.6, wt * 1.6, abs(tvd - uTops[i])));
    float ground = 1.0 - smoothstep(wt * 0.8, wt * 2.2, abs(tvd - uRkb));
    float gy = abs(fract(tvd / 1000.0 + 0.5) - 0.5) * 1000.0;
    float gx = abs(fract(x / 1000.0 + 0.5) - 0.5) * 1000.0;
    float dash = step(0.5, fract(x / 60.0));
    float dashY = step(0.5, fract(tvd / 60.0));
    float grid = max((1.0 - smoothstep(wt * 0.5, wt * 1.5, gy)) * dash, (1.0 - smoothstep(wx * 0.5, wx * 1.5, gx)) * dashY) * 0.09;
    float edge = smoothstep(uFocus.x - uFade, uFocus.x - uFade * 0.7, x) * smoothstep(uFocus.x + uFade, uFocus.x + uFade * 0.7, x);
    float a = max(max(fill, line * 0.4), max(ground * 0.35, grid)) * edge * uAlpha;
    vec3 c = mix(uInk, uAccent, band < 0.0 ? 0.0 : 0.6);
    frag = vec4(c * a, a);
    return;
  }

  if (uMode == 1) {
    float facing = dot(N, V);
    if (facing * uFacing < 0.0) discard;
    float fr = pow(1.0 - abs(facing), 2.2);
    vec3 R = reflect(-V, N * sign(facing));
    vec3 c = mix(base, uInk, 0.35 + 0.5 * fr) + env(R, 0.2) * fr * 0.35;
    float a = uAlpha * (0.18 + 0.82 * fr) * fog;
    c = pow(aces(c), vec3(1.0 / 2.2));
    frag = vec4(c * a, a);
    return;
  }

  vec3 col;
  if (uMode == 4) col = base;
  else col = lit(base, mr.x, mr.y, N, V);
  col = pow(aces(col * 1.05), vec3(1.0 / 2.2));
  float a = uAlpha * fog;
  frag = vec4(col * a, a);
}`;

/* ------------------------------------------------------------------------ */
/* Tokens → linear colour                                                    */

type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Resolve a CSS custom property to linear sRGB. The browser does the colour
 * maths: the token (OKLCH) is painted into a 1×1 canvas and read back.
 */
function readTokens(root: HTMLElement, names: string[]): Record<string, RGB> {
  const probe = document.createElement("span");
  probe.style.display = "none";
  root.appendChild(probe);
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const out: Record<string, RGB> = {};
  for (const n of names) {
    probe.style.color = `var(${n})`;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[n] = [toLinear(d[0] / 255), toLinear(d[1] / 255), toLinear(d[2] / 255)];
  }
  probe.remove();
  return out;
}

interface Material {
  color: RGB;
  metal: number;
  rough: number;
}

interface Palette {
  ink: RGB;
  paper: RGB;
  accent: RGB;
  dark: RGB;
  light: RGB;
  isDark: boolean;
  m: Record<
    "steel" | "satin" | "bright" | "carbide" | "accent" | "paint" | "glassWin" | "cable" | "casing" | "hole" | "bitBody" | "chip",
    Material
  >;
}

function palette(root: HTMLElement): Palette {
  const t = readTokens(root, ["--foreground", "--background", "--primary", "--muted-foreground"]);
  const ink = t["--foreground"];
  const paper = t["--background"];
  const accent = t["--primary"];
  const isDark = lum(paper) < lum(ink);
  const dark = isDark ? paper : ink;
  const light = isDark ? ink : paper;
  const g = (k: number) => mix3(dark, light, k);
  return {
    ink,
    paper,
    accent,
    dark,
    light,
    isDark,
    m: {
      steel: { color: g(0.62), metal: 1, rough: 0.3 },
      satin: { color: g(0.74), metal: 1, rough: 0.2 },
      bright: { color: g(0.92), metal: 1, rough: 0.07 },
      carbide: { color: g(0.16), metal: 0.7, rough: 0.38 },
      accent: { color: accent, metal: 0.15, rough: 0.35 },
      paint: { color: g(isDark ? 0.8 : 0.86), metal: 0, rough: 0.55 },
      glassWin: { color: g(0.05), metal: 0.2, rough: 0.05 },
      cable: { color: g(0.35), metal: 1, rough: 0.45 },
      casing: { color: g(isDark ? 0.55 : 0.4), metal: 1, rough: 0.3 },
      hole: { color: g(0.4), metal: 0, rough: 1 },
      bitBody: { color: g(0.3), metal: 1, rough: 0.42 },
      chip: { color: mix3(g(0.55), accent, 0.12), metal: 0, rough: 0.9 },
    },
  };
}

/* ------------------------------------------------------------------------ */
/* GL plumbing                                                               */

interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = [
  "uVP", "uH", "uExag", "uSpin", "uPush", "uOffset", "uCuttings", "uCut", "uTime", "uLat0", "uLatMd",
  "uColor", "uMR", "uMode", "uAlpha", "uFacing", "uCam", "uKeyDir", "uKeyCol", "uFillDir", "uFillCol",
  "uEnvTop", "uEnvBot", "uEnvStrip", "uInk", "uPaper", "uAccent", "uFogNear", "uFogFar", "uGrid", "uFocus", "uFade",
  "uTops", "uRkb",
];

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`Well scene shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`Well scene program: ${gl.getProgramInfoLog(prog)}`);
  const u: Program["u"] = {};
  for (const n of UNIFORMS) u[n] = gl.getUniformLocation(prog, n) ?? gl.getUniformLocation(prog, `${n}[0]`);
  return { prog, u };
}

interface MeshBuf {
  pos: WebGLBuffer;
  nrm: WebGLBuffer;
  mat: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
}

type MatSlots = [Material, Material, Material, Material];

interface Draw {
  vao: WebGLVertexArrayObject;
  count: number;
  instances: number;
  world: boolean;
  mode: 0 | 1 | 2 | 3 | 4;
  mats: MatSlots;
  alpha: number;
  spin?: boolean;
  string?: boolean;
  pad?: number;
  cuttings?: boolean;
  grid?: number;
  fade?: number;
  focus?: V3;
  /** Visible only when this returns > 0; the value scales alpha. */
  vis?: () => number;
  order: number;
}

/* ------------------------------------------------------------------------ */
/* The scene                                                                 */

export interface SceneHud {
  md: HTMLElement | null;
  tvd: HTMLElement | null;
  inc: HTMLElement | null;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** Element whose computed tokens colour the scene (the hero). */
  tokenRoot: HTMLElement;
  /** Empty element the scene fills with positioned labels. */
  labelLayer: HTMLElement;
  hud: SceneHud;
  onChapter: (i: number) => void;
  /** Fraction of the canvas width the subject is shifted right on wide screens. */
  shift: () => number;
  /** Screen areas labels must stay out of (the headline, the caption). */
  avoid?: () => (DOMRect | undefined)[];
  /**
   * Where to frame the subject, when not the whole canvas: on a phone the
   * scene gets its own band between the copy and the caption. Return null
   * (or an empty rect) to frame against the full canvas.
   */
  frame?: () => DOMRect | null | undefined;
  /** Called when the GPU cannot keep up even at 1× — the host should pause. */
  onDegrade?: () => void;
}

const HOLD = 9;
/** The geological section runs to here, TVD ft. */
const SECTION_BOTTOM = 4900;
const TRAVEL = 3.6;

export class WellScene {
  private gl: WebGL2RenderingContext;
  private opts: SceneOptions;
  private pathProg!: Program;
  private worldProg!: Program;
  private draws: Draw[] = [];
  private pal!: Palette;
  private raf = 0;
  private running = false;
  private visible = true;
  private paused = false;
  private reduced = false;
  private last = 0;
  private clock = 0;
  private spin = 0;
  private from = 0;
  private to = 0;
  private phase: "hold" | "travel" = "hold";
  private phaseT = 0;
  private travelLen = TRAVEL;
  private drag = { yaw: 0, pitch: 0 };
  private labelEls: HTMLElement[] = [];
  private labelW: number[] = [];
  private hudTick = 0;
  private size = [1, 1];
  private cleanups: (() => void)[] = [];
  private lost = false;
  /** Frame-time watchdog: [frames, total seconds]. */
  private probe: [number, number] = [0, 0];
  private dprCap = 2;

  constructor(opts: SceneOptions) {
    this.opts = opts;
    const gl = opts.canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 unavailable");
    // A software rasteriser would freeze the page on a million vertices.
    // Virtual desktops (VDI/Citrix) commonly land here; they get the flat
    // well profile instead.
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    if (/swiftshader|llvmpipe|softpipe|basic render|software/i.test(renderer)) throw new Error(`Software renderer: ${renderer}`);
    this.gl = gl;
    this.init();

    const onLost = (e: Event) => {
      e.preventDefault();
      this.lost = true;
      this.stopLoop();
    };
    const onRestored = () => {
      this.lost = false;
      this.draws = [];
      this.init();
      this.kick();
    };
    opts.canvas.addEventListener("webglcontextlost", onLost);
    opts.canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      opts.canvas.removeEventListener("webglcontextlost", onLost);
      opts.canvas.removeEventListener("webglcontextrestored", onRestored);
    });

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(opts.canvas);
    this.cleanups.push(() => ro.disconnect());

    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.kick();
    });
    io.observe(opts.canvas);
    this.cleanups.push(() => io.disconnect());

    const onVis = () => this.kick();
    document.addEventListener("visibilitychange", onVis);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onVis));

    // Theme: the viewer toggles `dark` on <html>.
    const mo = new MutationObserver(() => {
      this.refreshPalette();
      this.renderOnce();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    this.cleanups.push(() => mo.disconnect());

    this.makeLabels();
    this.resize();
  }

  /* ---- setup ---------------------------------------------------------- */

  /** Re-read the tokens in place: draws hold references to these materials. */
  private refreshPalette() {
    const next = palette(this.opts.tokenRoot);
    const cur = this.pal;
    for (const k of Object.keys(next.m) as (keyof Palette["m"])[]) Object.assign(cur.m[k], next.m[k]);
    cur.ink = next.ink;
    cur.paper = next.paper;
    cur.accent = next.accent;
    cur.dark = next.dark;
    cur.light = next.light;
    cur.isDark = next.isDark;
  }

  private init() {
    const gl = this.gl;
    this.pathProg = compile(gl, PATH_VS, FS);
    this.worldProg = compile(gl, WORLD_VS, FS);
    this.pal = palette(this.opts.tokenRoot);
    this.build();
  }

  private upload(g: Geo): MeshBuf {
    const gl = this.gl;
    const buf = (data: ArrayBufferView, target: number = gl.ARRAY_BUFFER) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    return {
      pos: buf(new Float32Array(g.pos)),
      nrm: buf(new Float32Array(g.nrm)),
      mat: buf(new Float32Array(g.mat)),
      idx: buf(new Uint32Array(g.idx), gl.ELEMENT_ARRAY_BUFFER),
      count: g.idx.length,
    };
  }

  private vao(mesh: MeshBuf, setup: () => void) {
    const gl = this.gl;
    const v = gl.createVertexArray()!;
    gl.bindVertexArray(v);
    const attr = (loc: number, b: WebGLBuffer, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, mesh.pos, 3);
    attr(1, mesh.nrm, 3);
    attr(2, mesh.mat, 1);
    setup();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.bindVertexArray(null);
    return v;
  }

  /** A downhole mesh placed by per-instance frames (5 floats each). */
  private pathInstanced(g: Geo, frames: Float32Array, d: Omit<Draw, "vao" | "count" | "instances" | "world">) {
    const gl = this.gl;
    const mesh = this.upload(g);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, frames, gl.STATIC_DRAW);
    const vao = this.vao(mesh, () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 20, 0);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16);
      gl.vertexAttribDivisor(4, 1);
    });
    this.draws.push({ ...d, vao, count: mesh.count, instances: frames.length / 5, world: false });
  }

  /** A tube that follows the well path, with a frame per ring. */
  private pathTube(md0: number, md1: number, radius: number, d: Omit<Draw, "vao" | "count" | "instances" | "world">, segs = 96) {
    const gl = this.gl;
    const g = new Geo();
    const frames: number[] = [];
    const mds = new Set<number>([md0, md1]);
    for (let md = Math.ceil(md0 / 10) * 10; md < md1; md += 10) {
      const inc = station(md).inc;
      const curving = station(md + 10).inc - inc > 1e-6 || inc - station(md - 10).inc > 1e-6;
      if (curving || md % 250 === 0) mds.add(md);
    }
    const list = [...mds].sort((a, b) => a - b);
    for (const md of list) {
      const s = station(md);
      for (let k = 0; k < segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        g.vert([0, radius * Math.cos(t), radius * Math.sin(t)], [0, Math.cos(t), Math.sin(t)], 0);
        frames.push(s.pos[0], s.pos[1], s.pos[2], s.inc, md);
      }
    }
    for (let i = 0; i < list.length - 1; i++)
      for (let k = 0; k < segs; k++) {
        const a = i * segs + k;
        const b = i * segs + ((k + 1) % segs);
        g.tri(a, a + segs, b + segs);
        g.tri(a, b + segs, b);
      }
    const mesh = this.upload(g);
    const fb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frames), gl.STATIC_DRAW);
    const vao = this.vao(mesh, () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, fb);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16);
    });
    this.draws.push({ ...d, vao, count: mesh.count, instances: 1, world: false });
  }

  /** World meshes by instance matrices. */
  private worldInstanced(g: Geo, mats: number[], d: Omit<Draw, "vao" | "count" | "instances" | "world">) {
    if (!mats.length) return;
    const gl = this.gl;
    const mesh = this.upload(g);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mats), gl.STATIC_DRAW);
    const vao = this.vao(mesh, () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(3 + i);
        gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 64, i * 16);
        gl.vertexAttribDivisor(3 + i, 1);
      }
    });
    this.draws.push({ ...d, vao, count: mesh.count, instances: mats.length / 16, world: true });
  }

  private build() {
    const P = this.pal.m;
    const slots = (a: Material, b = a, c = P.carbide, d = P.bright): MatSlots => [a, b, c, d];
    // Downhole detail only matters up close; far away it would shimmer.
    const near = (limit: number) => () => clamp(1 - (this.cam.dist - limit) / limit);
    const far = (limit: number) => () => clamp((this.cam.dist - limit) / limit);

    /* Rig */
    const rig = buildRig();
    const rigMat: Record<RigMat, Material> = {
      struct: P.paint,
      accent: P.accent,
      steel: P.steel,
      dark: P.carbide,
      glass: P.glassWin,
      cable: P.cable,
    };
    const onSurface = () => (this.camTarget[1] > -900 || this.cam.dist > 3000 ? 1 : 0);
    const box = unitBox();
    const cyl = unitCylinder(20);
    for (const m of RIG_MATS) {
      const s = slots(rigMat[m]);
      this.worldInstanced(box, rig.box[m], { mode: 0, mats: s, alpha: 1, order: 0, vis: onSurface });
      this.worldInstanced(cyl, rig.cyl[m], { mode: 0, mats: s, alpha: 1, order: 0, vis: onSurface });
      const tg = rig.tubes[m];
      if (tg.count) this.worldInstanced(tg, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], { mode: 0, mats: s, alpha: 1, order: 0, vis: onSurface });
    }

    /* Ground and formation planes */
    const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const plane = (y: number, x0: number, x1: number, z0: number, z1: number) =>
      new Geo().box([(x0 + x1) / 2, y, (z0 + z1) / 2], [(x1 - x0) / 2, 0, 0], [0, 0.001, 0], [0, 0, (z1 - z0) / 2], 0);
    this.worldInstanced(plane(0, -3000, 3000, -3000, 3000), ident, {
      mode: 2, mats: slots(P.steel), alpha: 1, order: 1, grid: 16, fade: 520, focus: [-10, 0, 0],
      vis: () => clamp(1 - (this.cam.dist - 3000) / 3000),
    });
    // The section: a vertical panel in the plane of the well, set back behind it.
    const section = new Geo().box([2100, (0 + RKB - SECTION_BOTTOM) / 2, -350], [3500, 0, 0], [0, (SECTION_BOTTOM - RKB) / 2, 0], [0, 0, 0.5], 0);
    this.worldInstanced(section, ident, { mode: 3, mats: slots(P.steel), alpha: 1, order: 1, fade: 3500, focus: [2100, 0, 0], vis: far(1600) });

    /* Borehole and casing (glass), largest first */
    const holes = [
      ...CASING.map((c) => ({ r: c.hole / 24, top: c.holeTop, bottom: c.shoe })),
      { r: OPEN_HOLE.hole / 24, top: OPEN_HOLE.top, bottom: OPEN_HOLE.bottom },
    ];
    holes.forEach((h, i) =>
      this.pathTube(h.top, h.bottom, h.r, { mode: 1, mats: slots(P.hole), alpha: 0.32, order: 2 + i * 0.01 }),
    );
    CASING.forEach((c, i) =>
      this.pathTube(RKB, c.shoe, c.od / 24, { mode: 1, mats: slots(P.casing), alpha: 0.5, order: 3 + i * 0.01 }),
    );
    for (const c of CASING) {
      this.pathInstanced(coupling(c), couplingInstances(c), { mode: 0, mats: slots(P.casing), alpha: 1, order: 0, vis: near(2600) });
      this.pathInstanced(floatShoe(c), shoeInstance(c), { mode: 0, mats: slots(P.casing, P.paint, P.carbide), alpha: 1, order: 0 });
    }

    /* The string */
    const str = { spin: true, string: true, mode: 0 as const, alpha: 1, order: 0 };
    this.pathInstanced(dpJoint(), dpInstances(), { ...str, mats: slots(P.steel, P.steel, P.carbide) });
    const hw = BHA.filter((p) => p.kind === "hwdp");
    this.pathInstanced(hwdpJoint(), new Float32Array(hw.flatMap((p) => [...partInstance(p)])), { ...str, mats: slots(P.steel, P.steel, P.carbide) });
    for (const p of BHA) {
      if (p.kind === "hwdp") continue;
      if (p.kind === "bit") {
        this.pathInstanced(pdcBit(), partInstance(p), { ...str, mats: [P.bitBody, P.bitBody, P.carbide, P.bright], vis: near(400) });
        continue;
      }
      const mats =
        p.kind === "mwd"
          ? slots(P.steel, P.accent)
          : p.kind === "nmdc"
            ? slots(P.satin, P.satin, P.carbide, P.satin)
            : slots(P.steel);
      this.pathInstanced(bhaPart(p), partInstance(p), { ...str, mats, vis: near(3000) });
      if (p.kind === "rss")
        PAD_ANGLES.forEach((_, i) =>
          this.pathInstanced(rssPad(PAD_ANGLES[i]), partInstance(p), { ...str, mats: slots(P.steel, P.steel, P.carbide), pad: i, vis: near(400) }),
        );
    }

    /* Cuttings: flowing up the low side, and a bed on it */
    const chip = new Geo();
    {
      const pts: V3[] = [
        [1, 0.1, 0], [-0.8, 0.2, 0.3], [0.1, 0.9, -0.2], [0.2, -0.8, 0.1], [-0.1, 0.1, 1], [0.3, -0.2, -0.9],
      ];
      const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
      for (const f of faces) {
        const [a, b, c] = f.map((i) => pts[i]);
        const n = normFace(a, b, c);
        const s = chip.count;
        chip.vert(a, n, 0);
        chip.vert(b, n, 0);
        chip.vert(c, n, 0);
        chip.tri(s, s + 1, s + 2);
      }
    }
    const cut: number[] = [];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const bed = i < 1300;
      const md = TD - 420 + rnd() * 420;
      const ang = (rnd() - 0.5) * (bed ? 1.3 : 2.4);
      const frac = bed ? 0.93 + rnd() * 0.06 : 0.3 + rnd() * 0.6;
      const size = (bed ? 0.012 : 0.008) + rnd() * 0.014;
      cut.push(md, ang, frac, bed ? -(0.1 + rnd()) : 0.1 + rnd(), size);
    }
    this.pathInstanced(chip, new Float32Array(cut), { mode: 0, mats: slots(P.chip), alpha: 1, order: 0, cuttings: true, vis: near(80) });

    this.draws.sort((a, b) => a.order - b.order);
  }

  /* ---- labels --------------------------------------------------------- */

  private makeLabels() {
    const layer = this.opts.labelLayer;
    layer.replaceChildren();
    this.labelEls = LABELS.map((l) => {
      const el = document.createElement("div");
      el.className = "well2-label";
      el.dataset.side = l.side ?? "right";
      if (l.kind) el.dataset.kind = l.kind;
      const dot = document.createElement("span");
      dot.className = "well2-label-dot";
      const text = document.createElement("span");
      text.className = "well2-label-text";
      text.textContent = l.text;
      el.append(dot, text);
      layer.appendChild(el);
      return el;
    });
  }

  /* ---- camera --------------------------------------------------------- */

  private cam = { dist: 1, fov: 30 * DEG, exag: 1, shift: 1 };
  private distMul = 1;
  private camTarget: V3 = [0, 0, 0];
  private chapterWeight: number[] = CHAPTERS.map((_, i) => (i === 0 ? 1 : 0));

  private camPose(c: Cam): { target: V3; md: number | null } {
    return c.md !== undefined ? { target: station(c.md).pos, md: c.md } : { target: c.target!, md: null };
  }

  private computeCamera() {
    const a = CHAPTERS[this.from].cam;
    const b = CHAPTERS[this.to].cam;
    const t = this.phase === "travel" ? easeInOut(clamp(this.phaseT / this.travelLen)) : 0;
    const pa = this.camPose(a);
    const pb = this.camPose(b);
    const lg = (x: number, y: number) => Math.exp(lerp(Math.log(x), Math.log(y), t));
    const base = lg(a.dist, b.dist);
    // Pan in step with the zoom: the target's remaining offset shrinks with
    // the view, so a zoom from the plan to arm's length keeps the subject in
    // frame the whole way (a light form of van Wijk & Nuij's smooth zoom).
    const u = Math.abs(Math.log(a.dist / b.dist)) > 1 ? 1 - (base - b.dist) / (a.dist - b.dist) : t;
    let target: V3;
    let md: number | null = null;
    if (pa.md !== null && pb.md !== null) {
      md = lerp(pa.md, pb.md, u);
      target = station(md).pos;
    } else {
      target = lerp3(pa.target, pb.target, u);
      md = u < 0.5 ? pa.md : pb.md;
    }
    let dist = base * this.distMul;
    let exag = lg(a.exag, b.exag);
    // A long trip between two close views hops: rise out, fly over, come back
    // in — never a tunnel through the rock at arm's length.
    const span = Math.hypot(pa.target[0] - pb.target[0], pa.target[1] - pb.target[1], pa.target[2] - pb.target[2]);
    if (span > 3 * Math.max(a.dist, b.dist)) {
      const hop = Math.pow(Math.sin(Math.PI * t), 2);
      dist = Math.exp(lerp(Math.log(dist), Math.log(Math.max(dist, span * 1.15)), hop));
      exag = Math.max(exag, lerp(exag, dist / 240, hop));
    }
    const drift = this.reduced ? 0 : Math.sin(this.clock * 0.13) * 0.09;
    const yaw = lerp(a.yaw, b.yaw, t) + drift + this.drag.yaw;
    const pitch = clamp(lerp(a.pitch, b.pitch, t) + this.drag.pitch, -0.6, 1.2);
    const fov = lerp(a.fov, b.fov, t) * DEG;
    const shift = lerp(a.shift ?? 1, b.shift ?? 1, t);
    this.cam = { dist, fov, exag, shift };
    this.camTarget = target;
    const eye: V3 = add(target, scale([Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)], dist));
    this.chapterWeight = CHAPTERS.map((_, i) => (i === this.to ? t : 0) + (i === this.from ? 1 - t : 0));
    return { eye, target, md, dist, exag, fov };
  }

  /* ---- frame ---------------------------------------------------------- */

  private frame = (now: number) => {
    this.raf = 0;
    const raw = this.last ? (now - this.last) / 1000 : 0;
    const dt = Math.min(0.1, raw);
    this.last = now;
    this.watchdog(raw);
    if (!this.reduced && !this.paused) {
      this.clock += dt;
      this.spin += dt * 2 * Math.PI * 0.32;
      this.phaseT += dt;
      if (this.phase === "hold" && this.phaseT > HOLD) this.startTravel((this.to + 1) % CHAPTERS.length);
      else if (this.phase === "travel" && this.phaseT >= this.travelLen) {
        this.from = this.to;
        this.phase = "hold";
        this.phaseT = 0;
      }
    }
    this.draw();
    if (this.shouldRun()) this.raf = requestAnimationFrame(this.frame);
    else this.running = false;
  };

  /**
   * If the GPU cannot hold ~25 fps, drop to 1× pixel ratio; if it still
   * cannot, stop the tour on a composed frame and say so.
   */
  private watchdog(raw: number) {
    if (raw <= 0 || raw > 1) return;
    const p = this.probe;
    p[0]++;
    p[1] += raw;
    if (p[0] < 40) return;
    const avg = p[1] / p[0];
    this.probe = [0, 0];
    if (avg < 0.04) return;
    if (this.dprCap > 1) {
      this.dprCap = 1;
      this.resize();
    } else if (!this.paused) {
      this.opts.onDegrade?.();
    }
  }

  private startTravel(to: number) {
    const a = CHAPTERS[this.to].cam;
    const b = CHAPTERS[to].cam;
    this.from = this.to;
    this.to = to;
    this.phase = "travel";
    this.phaseT = 0;
    // Longer trips for bigger changes of scale.
    this.travelLen = TRAVEL + Math.min(2.4, Math.abs(Math.log(a.dist / b.dist)) * 0.3);
    this.drag = { yaw: 0, pitch: 0 };
    this.opts.onChapter(to);
  }

  private draw() {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    const [w, h] = this.size;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Frame into a band (phones) or shift right of the copy (wide screens).
    const cr = this.opts.canvas.getBoundingClientRect();
    const band = this.opts.frame?.();
    let sx = 0;
    let sy = 0;
    if (band && band.width > 0 && band.height > 0 && cr.height > 0) {
      sx = ((band.left + band.width / 2 - cr.left) / cr.width - 0.5) * 2;
      sy = (0.5 - (band.top + band.height / 2 - cr.top) / cr.height) * 2;
      this.distMul = (cr.height / Math.min(band.width * 1.1, band.height)) * 0.95;
    } else this.distMul = 1;
    const c = this.computeCamera();
    const aspect = w / h;
    const near = Math.max(0.03, c.dist * 0.015);
    const farP = c.dist * 40 + 800;
    const proj = perspective(c.fov, aspect, near, farP);
    if (band && band.width > 0) {
      proj[8] = -sx;
      proj[9] = -sy;
    } else proj[8] = -this.opts.shift() * this.cam.shift;
    const view = lookAt(c.eye, c.target, [0, 1, 0]);
    const vp = multiply(proj, view);

    const P = this.pal;
    const keyDir: V3 = [-0.45, 0.8, 0.55];
    const fillDir: V3 = [0.7, 0.25, -0.6];
    const k = P.isDark ? 1 : 0.9;
    const env = {
      top: mix3(P.dark, P.light, P.isDark ? 0.22 : 0.78),
      bot: P.isDark ? (scale(P.dark, 0.6) as RGB) : mix3(P.dark, P.light, 0.32),
      strip: scale(P.light, P.isDark ? 2.2 : 1.25) as RGB,
    };
    const land = station(LANDING_MD);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);

    let current: Program | null = null;
    const use = (p: Program) => {
      if (current === p) return;
      current = p;
      gl.useProgram(p.prog);
      const u = p.u;
      gl.uniformMatrix4fv(u.uVP, false, vp);
      gl.uniform3fv(u.uH, H);
      gl.uniform1f(u.uExag, c.exag);
      gl.uniform1f(u.uTime, this.clock);
      gl.uniform3fv(u.uCam, c.eye);
      gl.uniform3fv(u.uKeyDir, keyDir);
      gl.uniform3fv(u.uKeyCol, [2.6 * k, 2.55 * k, 2.5 * k]);
      gl.uniform3fv(u.uFillDir, fillDir);
      gl.uniform3fv(u.uFillCol, scale(mix3(P.light, P.accent, 0.5), 0.7));
      gl.uniform3fv(u.uEnvTop, env.top);
      gl.uniform3fv(u.uEnvBot, env.bot);
      gl.uniform3fv(u.uEnvStrip, env.strip);
      gl.uniform3fv(u.uInk, P.ink);
      gl.uniform3fv(u.uPaper, P.paper);
      gl.uniform3fv(u.uAccent, P.accent);
      gl.uniform1f(u.uFogNear, c.dist * 1.6);
      gl.uniform1f(u.uFogFar, c.dist * 7);
      gl.uniform4f(u.uCut, TD - 420, TD, 0, 0);
      gl.uniform3fv(u.uLat0, land.pos);
      gl.uniform1f(u.uLatMd, LANDING_MD);
      gl.uniform1fv(u.uTops, [...FORMATIONS.map((f) => f.top), SECTION_BOTTOM]);
      gl.uniform1f(u.uRkb, RKB);
    };

    const padSpeed = 1;
    for (const glass of [false, true]) {
      for (const d of this.draws) {
        if ((d.mode === 1 || d.mode === 2 || d.mode === 3) !== glass) continue;
        const vis = d.vis ? d.vis() : 1;
        if (vis <= 0.001) continue;
        const p = d.world ? this.worldProg : this.pathProg;
        use(p);
        const u = p.u;
        gl.uniform3fv(u.uColor, d.mats.flatMap((m) => m.color));
        gl.uniform2fv(u.uMR, d.mats.flatMap((m) => [m.metal, m.rough]));
        gl.uniform1i(u.uMode, d.mode);
        gl.uniform1f(u.uAlpha, d.alpha * vis);
        gl.uniform1f(u.uSpin, d.spin ? this.spin : 0);
        gl.uniform1i(u.uCuttings, d.cuttings ? 1 : 0);
        if (d.cuttings) {
          const rIn = 6.75 / 24;
          gl.uniform4f(u.uCut, TD - 420, TD, rIn * 1.02, OPEN_HOLE.hole / 24 - 0.012);
        }
        if (d.string) {
          // DP and HWDP lie on the low side; the stabilised BHA sits near centre.
          const jar = BHA.find((b) => b.kind === "jar")!;
          gl.uniform4f(u.uOffset, 0.078, 0.004, jar.top - 10, jar.bottom);
        } else gl.uniform4f(u.uOffset, 0, 0, 0, 1);
        if (d.pad !== undefined) {
          const a = PAD_ANGLES[d.pad];
          const face = Math.cos(a + this.spin * padSpeed);
          const push = Math.pow(Math.max(0, face), 3) * PAD_MAX_PUSH;
          gl.uniform3f(u.uPush, Math.cos(a), Math.sin(a), push);
        } else gl.uniform3f(u.uPush, 0, 0, 0);
        if (d.fade) {
          gl.uniform1f(u.uGrid, d.grid ?? 1);
          gl.uniform1f(u.uFade, d.fade);
          gl.uniform3fv(u.uFocus, d.focus ?? [0, 0, 0]);
        }
        gl.depthMask(!glass);
        gl.bindVertexArray(d.vao);
        const passes = d.mode === 1 ? [-1, 1] : [1];
        for (const f of passes) {
          gl.uniform1f(u.uFacing, f);
          gl.drawElementsInstanced(gl.TRIANGLES, d.count, gl.UNSIGNED_INT, 0, d.instances);
        }
      }
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);

    this.placeLabels(vp);
    if (++this.hudTick % 6 === 0 || !this.shouldRun()) this.writeHud(c.md);
  }

  private placeLabels(vp: M4) {
    const rect = this.opts.canvas.getBoundingClientRect();
    const avoid = (this.opts.avoid?.() ?? []).filter((r): r is DOMRect => !!r);
    LABELS.forEach((l, i) => {
      const el = this.labelEls[i];
      const w = Math.max(0, ...l.in.map((c) => this.chapterWeight[c]));
      const weight = smooth(clamp((w - 0.55) / 0.45));
      if (weight <= 0.01) {
        el.style.opacity = "0";
        return;
      }
      const at = l.at ?? station(l.md!).pos;
      const [x, y, wc] = project(vp, at);
      if (wc <= 0 || Math.abs(x) > 1.05 || Math.abs(y) > 1.05) {
        el.style.opacity = "0";
        return;
      }
      const px = ((x + 1) / 2) * rect.width;
      const py = ((1 - y) / 2) * rect.height;
      // The label's text box, in viewport px, must not touch the copy.
      const gx = rect.left + px;
      const gy = rect.top + py;
      const tw = (this.labelW[i] ||= (el.lastElementChild as HTMLElement | null)?.offsetWidth ?? 0) || 140;
      const side = l.side ?? "right";
      const x0 = side === "left" ? gx - 16 - tw : side === "below" ? gx - 10 : gx + 16;
      const y0 = side === "below" ? gy + 16 : gy - 14;
      const pad = 10;
      const hit = avoid.some((r) => x0 < r.right + pad && x0 + tw > r.left - pad && y0 < r.bottom + pad && y0 + 28 > r.top - pad);
      if (hit) {
        el.style.opacity = "0";
        return;
      }
      el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
      el.style.opacity = String(weight);
    });
  }

  private writeHud(md: number | null) {
    const { hud } = this.opts;
    const s = station(md ?? (this.camTarget[1] > 0 ? 0 : TD));
    if (hud.md) hud.md.textContent = Math.max(0, Math.round(s.md)).toLocaleString("en-GB");
    if (hud.tvd) hud.tvd.textContent = Math.max(0, Math.round(s.tvd)).toLocaleString("en-GB");
    if (hud.inc) hud.inc.textContent = (s.inc / DEG).toFixed(1);
  }

  /* ---- control -------------------------------------------------------- */

  /** Hidden tabs need no check: browsers stop rAF there, and resume it on return. */
  private shouldRun() {
    return this.visible && !this.reduced && !this.paused && !this.lost;
  }

  private kick() {
    if (this.shouldRun()) {
      if (!this.running) {
        this.running = true;
        this.last = 0;
        this.raf = requestAnimationFrame(this.frame);
      }
    } else this.renderOnce();
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
  }

  renderOnce() {
    if (this.running || this.lost) return;
    requestAnimationFrame(() => this.draw());
  }

  private resize() {
    const c = this.opts.canvas;
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.size = [w, h];
    this.renderOnce();
  }

  /** Jump or travel to a chapter. Instant under reduced motion. */
  goTo(i: number) {
    if (i === this.to && this.phase === "hold") return;
    if (this.reduced || this.paused) {
      this.from = this.to = i;
      this.phase = "hold";
      this.phaseT = 0;
      this.drag = { yaw: 0, pitch: 0 };
      this.opts.onChapter(i);
      this.renderOnce();
      return;
    }
    if (this.phase === "travel") this.from = this.to;
    this.startTravel(i);
    this.kick();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p && this.phase === "travel") {
      // Settle where the trip was heading rather than freezing mid-flight.
      this.from = this.to;
      this.phase = "hold";
      this.phaseT = 0;
    }
    this.kick();
  }

  setReduced(r: boolean) {
    this.reduced = r;
    if (r) {
      this.from = this.to;
      this.phase = "hold";
    }
    this.kick();
  }

  /** Pointer drag nudges the view; the next chapter resets it. */
  nudge(dx: number, dy: number) {
    this.drag.yaw -= dx * 0.004;
    this.drag.pitch = clamp(this.drag.pitch + dy * 0.003, -0.5, 0.6);
    if (!this.running) this.renderOnce();
  }

  dispose() {
    this.stopLoop();
    for (const c of this.cleanups) c();
    this.opts.labelLayer.replaceChildren();
    // No loseContext(): StrictMode remounts onto the same canvas, and a lost
    // context would come back from getContext() still lost.
  }
}

function normFace(a: V3, b: V3, c: V3): V3 {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

