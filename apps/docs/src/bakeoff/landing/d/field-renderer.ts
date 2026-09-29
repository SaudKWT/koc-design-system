/**
 * Stipple particle field — a framework-free WebGL2 renderer.
 *
 * One set of particles (160k / 90k / 50k by device) that is, in turn, a dotted landscape the
 * camera flies over and a sequence of drilling models built from code (field-models.ts). A
 * `progress` value walks the sequence: at a whole number the field IS that state; between two,
 * every particle travels from its place in one to its place in the next, through curl-noise
 * turbulence that peaks at the midpoint (sin πt) and with a per-particle stagger (a model builds
 * from the ground up and dissolves from the top down). Progress is set from outside — the page
 * drives it from scroll — so the particles move only while the reader scrolls.
 *
 * Grown from the v1 terrain renderer (itself the terrain spike, ported). What the terrain became:
 *   - STIPPLE, not contour dots: every lattice point is a speck, jittered inside its cell (a
 *     world-stable hash, so nothing twinkles as the lattice re-anchors), so there is no grid and
 *     no moiré. Speck density is dithered by slope lighting (Lambert from a low sun, plus rim),
 *     like an engraving: ink where the ground is in shadow on the pale theme, light where it is
 *     lit on the dark one.
 *   - Contours still carry the drawing: a share of the specks snap (one Newton step) onto the
 *     nearest iso-line, so every contour is a dense, brighter line; index contours heavier.
 *   - Kept: the depth of field, fog, flight, pointer swell and parallax, the rigs with their
 *     directional wells (now denser stipple), the quiet zones behind copy, the composed start,
 *     the rig hover label, and the 30/60 fps cadence with its stall guard.
 *
 * GPU morph: the terrain is computed in the vertex shader from a per-particle lattice slot; each
 * model is a precomputed vec4 buffer (position + baked shade). Only the two states either side of
 * the current progress are bound (attributes 1 and 2), and the mix happens in the vertex shader.
 * The flight offset is frozen whenever the field is not settled on a terrain state.
 *
 * Density tiers: particles are stored in a random order, so drawing a prefix of the buffer is a
 * fair thinning of every state. The first ~45 frames are timed; while the median frame is slower
 * than ~21 ms the field steps down a tier. Phones start at the lowest tier by area.
 *
 * Lifecycle: the renderer creates its OWN canvas, so a StrictMode remount gets a fresh WebGL2
 * context; `destroy()` cancels the loop, disconnects every observer and listener, deletes every
 * GPU object and releases the context. It pauses in a hidden tab, offscreen, and when settled on
 * a state whose ink is 0. Reduced motion: no flight, swarm, sway or spin; progress snaps to the
 * nearest state and one composed frame is drawn per change.
 *
 * Colour: read from CSS custom properties (`--background`, `--foreground`, `--muted-foreground`,
 * `--primary`) through a 1×1 canvas, so `oklch()` arrives as sRGB. No colour literal here; the
 * only colour word is the `'transparent'` sentinel in the probe.
 */

import { MODEL_IDS, TIERS, buildModel, modelView, type ModelId } from "./field-models";

export type FieldModel = "terrain" | ModelId;
/** Every state the field can take, in a sensible story order. */
export const FIELD_MODELS: readonly FieldModel[] = ["terrain", ...MODEL_IDS];

/** One stop in the sequence the progress value walks. */
export interface FieldKey {
  model: FieldModel;
  /**
   * Where a model is framed, as fractions of the canvas: [left, top, right, bottom]. The model is
   * fitted inside, centred, at its own aspect. Ignored by the terrain, which is full-bleed.
   */
  frame?: readonly [number, number, number, number];
  /** Overall ink at this stop, 0–1 (default 1). Settled at 0, the field stops drawing. */
  ink?: number;
}

export interface FieldOptions {
  /** Pointer events and `[data-terrain-quiet]` zones are taken from this element. */
  scope?: HTMLElement | null;
  /** HTML element the hovered rig's sample ID is written into. Decorative. */
  label?: HTMLElement | null;
  /** Draw the terrain's rigs and well paths. */
  rigs?: boolean;
  /** Multiplier on the flight speed (1.1 units/s). */
  speed?: number;
  /** Multiplier (0.25–1) on the area-based particle budget. */
  density?: number;
  /** Pointer swell, parallax and rig hover. */
  interactive?: boolean;
  /** Start in reduced motion. */
  reduced?: boolean;
  sequence?: readonly FieldKey[];
  progress?: number;
  /** Called once if WebGL2 is unavailable, a shader fails to build, or the context is lost. */
  onFallback?: (why: string) => void;
}

// ── Tunables. World units: 1 terrain unit ≈ 280 m of well depth in the labels. ──────────────
const BASE = {
  freq: 1 / 44, amp: 5.5, seed: [311.7, -83.3] as const, ci: 0.3, // terrain + contour interval
  camH: 6.8, pitch: -0.15, fov: (40 * Math.PI) / 180, speed: 1.1, // camera (speed in units/s)
  focus: 36, coc: 0.011, fogN: 55, fogF: 150, // depth of field (coc = fraction of height)
  zNear: -6, zFar: 154, lodZ: 70, // beyond lodZ: every other lattice point
  tw: 0.03, // terrain speck, world size
  speck: 1.25, // speck size, CSS px
  contour: 0.34, // share of terrain specks that snap to a contour
  sun: [-0.62, 0.42, 0.66] as const, // low sun from the front left
  rigTile: 42, rigChance: 0.72, mPerUnit: 280, maxRigs: 24,
  swellR: 7, swellH: 1.1, parallax: [1.6, 0.6] as const,
  lateralSpread: (35 * Math.PI) / 180,
  maxQuiet: 8,
  swirl: 0.42, // turbulence amplitude, fraction of the canvas half-height
  ease: 0.14, // progress easing, s
} as const;

type Vec2 = [number, number];
type Vec3 = [number, number, number];

// ── Terrain height, CPU side. Must match the GLSL term for term: it places rigs and unprojects
//    the pointer. Integer hash, so both sides agree bit-for-bit on the lattice. ────────────────
const hsh = (x: number, y: number) => {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
const rnd = (x: number, y: number) => (hsh(x, y) >>> 8) * (2 / 16777215) - 1;
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = rnd(ix, iy), b = rnd(ix + 1, iy), c = rnd(ix, iy + 1), d = rnd(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function height(x: number, z: number) {
  let px = x * BASE.freq + BASE.seed[0], py = z * BASE.freq + BASE.seed[1], a = 0, b = 0.5;
  for (let i = 0; i < 4; i++) {
    a += b * noise(px, py);
    b *= 0.5;
    const nx = 2 * (0.8 * px - 0.6 * py);
    py = 2 * (0.6 * px + 0.8 * py);
    px = nx;
  }
  return a * BASE.amp;
}
const f = (v: number) => v.toFixed(8);
const sunN = (() => {
  const [x, y, z] = BASE.sun, l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as Vec3;
})();

const GLSL_NOISE = `
uint hsh(ivec2 p) {
  uint h = (uint(p.x) * 0x8da6b343u) ^ (uint(p.y) * 0xd8163841u);
  h = (h ^ (h >> 16u)) * 0x7feb352du; h = (h ^ (h >> 15u)) * 0x846ca68bu; return h ^ (h >> 16u);
}
float rnd(ivec2 p) { return float(hsh(p) >> 8u) * (2.0 / 16777215.0) - 1.0; }
vec3 noised(vec2 x) {             // value noise + analytic derivatives (quintic fade)
  vec2 i = floor(x), fr = x - i; ivec2 c = ivec2(i);
  vec2 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0), du = 30.0 * fr * fr * (fr * (fr - 2.0) + 1.0);
  float a = rnd(c), b = rnd(c + ivec2(1, 0)), cc = rnd(c + ivec2(0, 1)), d = rnd(c + ivec2(1, 1));
  float k4 = a - b - cc + d;
  return vec3(a + (b - a) * u.x + (cc - a) * u.y + k4 * u.x * u.y, du * (vec2(b - a, cc - a) + k4 * u.yx));
}
vec3 terrain(vec2 xz) {           // (height, dh/dx, dh/dz) in world units
  const mat2 M = mat2(0.8, 0.6, -0.6, 0.8), MI = mat2(0.8, -0.6, 0.6, 0.8);
  vec2 p = xz * ${f(BASE.freq)} + vec2(${f(BASE.seed[0])}, ${f(BASE.seed[1])});
  float a = 0.0, b = 0.5; vec2 d = vec2(0.0); mat2 m = mat2(1.0);
  for (int i = 0; i < 4; i++) { vec3 n = noised(p); a += b * n.x; d += b * (m * n.yz); b *= 0.5; p = 2.0 * (M * p); m = 2.0 * (MI * m); }
  return vec3(a, d * ${f(BASE.freq)}) * ${f(BASE.amp)};
}
float u16(uint h, uint k) { return float((h >> (k * 16u)) & 0xffffu) / 65535.0; }`;

// ── The particle program: terrain and models, mixed. ─────────────────────────────────────────
const PARTICLE_VS = `#version 300 es
precision highp float; precision highp int;
layout(location = 0) in vec2 aSlot;   // terrain lattice slot, cells from the (even) origin
layout(location = 1) in vec4 aA;      // model point for the FROM state (xyz, shade | -1 unused)
layout(location = 2) in vec4 aB;      // model point for the TO state
uniform mat4 uVP; uniform ivec2 uOI; uniform vec2 uCamRel; uniform vec3 uEye, uSun; uniform vec4 uHover;
uniform float uCell, uFocus, uCoc, uFocal, uMaxPt, uSpeck, uLight;
uniform int uKA, uKB; uniform mat4 uMA, uMB; uniform vec4 uFA, uFB; uniform vec2 uZ, uInk, uDens;
uniform float uT, uPhase, uSwirl, uAspect, uTerrainInk, uModelInk;
uniform vec3 uFg, uMuted, uPri;
out vec4 vCol; out float vSize, vSoft;
${GLSL_NOISE}
struct St { vec2 ndc; float size; float a; float soft; vec3 col; };
float swell(vec2 xz) { vec2 d = xz - uHover.xy; return uHover.z * exp(-dot(d, d) / (uHover.w * uHover.w)); }

St terrainSt() {
  const float CI = ${f(BASE.ci)};
  St s;
  ivec2 wi = uOI + ivec2(aSlot);
  bool coarse = ((wi.x | wi.y) & 1) == 0;
  uint h0 = hsh(wi), h1 = hsh(wi + ivec2(7919, -104729)), h2 = hsh(wi + ivec2(-3571, 60013));
  // Jitter inside the cell (a coarse point owns its whole 2×2 block): stipple, not a grid.
  vec2 local = aSlot + vec2(u16(h0, 0u), u16(h0, 1u)) * (coarse ? 2.0 : 1.0);
  float rSnap = u16(h1, 0u), rTone = u16(h1, 1u), rB = u16(h2, 0u), rN = u16(h2, 1u);
  vec3 t = terrain((vec2(uOI) + local) * uCell);
  float gl = sqrt(dot(t.yz, t.yz) + 1e-6), u = t.x / CI, k = floor(u + 0.5);
  float spacing = CI / gl;                     // world distance between neighbouring contours
  vec2 dir = t.yz / gl;
  // A share of the specks snap onto the nearest contour: the lines carry the drawing. Where the
  // contours crowd tighter than a couple of cells they stay loose, or the slope turns to felt.
  bool onC = rSnap < ${f(BASE.contour)} && spacing > 2.4 * uCell * (coarse ? 2.0 : 1.0);
  vec2 disp = onC ? ((k - u) * spacing + (rN - 0.5) * 0.3 * uCell) * dir : vec2(0.0);
  float hgt = onC ? k * CI : t.x;
  vec2 rel = local * uCell - uCamRel + disp;
  float far = smoothstep(${f(BASE.lodZ - 14)}, ${f(BASE.lodZ)}, aSlot.y * uCell - uCamRel.y);
  float sw = swell(rel);
  vec3 p = vec3(rel.x, hgt + sw * ${f(BASE.swellH)}, rel.y);
  vec3 n = normalize(vec3(-t.y, 1.0, -t.z));
  float facing = dot(n, normalize(uEye - p));
  float lam = max(dot(n, uSun), 0.0);
  float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 5.0);
  float lit = clamp(lam * 1.15 + 0.35 * rim, 0.0, 1.0);
  // Engraving: on the pale theme ink gathers in shadow; on the dark theme light gathers where lit.
  float tone = mix(lit, 1.0 - lit, uLight);
  float dens = onC ? 1.0 : mix(0.1, 1.0, tone);
  float a = step(rTone, dens) * (coarse ? 1.0 : 1.0 - far);
  a *= onC ? (mod(k, 5.0) == 0.0 ? 0.95 : 0.62) : 0.3 + 0.5 * rB;
  a *= mix(0.3, 1.0, smoothstep(-0.04, 0.12, facing));   // slopes turned away recede
  a *= 1.0 + 0.6 * sw;
  s.col = mix(onC ? uFg : uMuted, uPri, sw * 0.85);
  // Projection and depth of field: thin-lens circle of confusion, energy-conserving alpha, fog.
  vec4 c = uVP * vec4(p, 1.0); float z = c.w;
  float base = max(${f(BASE.tw)} * uFocal / max(z, 0.1), uSpeck * (0.8 + 0.4 * rB));
  float coc = uCoc * abs(1.0 - uFocus / max(z, 0.1));
  float size = min(sqrt(base * base + coc * coc), uMaxPt);
  float e = base / size;
  a *= clamp(e * e, 0.08, 1.0) * (1.0 - smoothstep(${f(BASE.fogN)}, ${f(BASE.fogF)}, z)) * smoothstep(2.0, 9.0, z);
  if (z < 0.5) a = 0.0;
  s.ndc = clamp(c.xy / max(z, 0.05), vec2(-1.6), vec2(1.6));
  s.size = size; s.a = a * uTerrainInk; s.soft = clamp(coc / size, 0.0, 1.0);
  return s;
}

St modelSt(vec4 m, mat4 M, vec4 F, float zRef, float dens, float rs, float rb) {
  St s;
  vec4 c = M * vec4(m.xyz, 1.0);
  s.ndc = F.xy + (c.xy / max(c.w, 0.05)) * F.zw;
  // w = shade + 2·code; code = accent + 2·ink level (field-sampler.ts, encodeW).
  float code = floor(max(m.w, 0.0) / 2.0);
  float shade = clamp(m.w - 2.0 * code, 0.0, 1.0);
  float acc = mod(code, 2.0), ink = 1.0 - floor(code / 2.0) / 8.0;
  float tone = mix(shade, 1.0 - 0.72 * shade, uLight);
  s.size = uSpeck * (0.75 + 0.55 * rs) * clamp(zRef / max(c.w, 0.05), 0.75, 1.35);
  s.a = m.w > -0.5 ? (0.3 + 0.7 * tone) * ink * (0.45 + 0.55 * rb) * uModelInk * dens * (acc > 0.5 ? 1.25 : 1.0) : 0.0;
  s.soft = 0.0;
  s.col = mix(uFg, uPri, acc);
  return s;
}

// Divergence-free swirl: the curl of a few travelling waves. Particles near each other flow
// together, so the swarm has currents rather than noise.
vec2 curl(vec2 p, float ph) {
  vec2 v = vec2(0.0);
  const vec2 K1 = vec2(1.7, 0.9), K2 = vec2(-1.1, 2.3), K3 = vec2(3.1, -2.6), K4 = vec2(-4.3, -3.7);
  v += vec2(K1.y, -K1.x) * cos(dot(K1, p) + ph) * 0.5;
  v += vec2(K2.y, -K2.x) * cos(dot(K2, p) - ph * 1.3 + 1.7) * 0.34;
  v += vec2(K3.y, -K3.x) * cos(dot(K3, p) + ph * 1.7 + 4.1) * 0.18;
  v += vec2(K4.y, -K4.x) * cos(dot(K4, p) - ph * 2.1 + 2.3) * 0.1;
  return v * 0.42;
}

void main() {
  uint hv = hsh(ivec2(gl_VertexID, 1777)), hw = hsh(ivec2(gl_VertexID, -9431));
  float q0 = u16(hv, 0u), q1 = u16(hv, 1u), q2 = u16(hw, 0u), q3 = u16(hw, 1u);
  bool needA = uT < 0.9999, needB = uT > 0.0001;
  St a, b;
  if (needA && needB && uKA == 0 && uKB == 0) { a = terrainSt(); b = a; }
  else {
    // (WebGL forbids ?: on structs.)
    if (needA) { if (uKA == 0) a = terrainSt(); else a = modelSt(aA, uMA, uFA, uZ.x, uDens.x, q1, q2); }
    if (needB) { if (uKB == 0) b = terrainSt(); else b = modelSt(aB, uMB, uFB, uZ.y, uDens.y, q1, q2); }
    if (!needA) a = b;
    if (!needB) b = a;
  }
  // Stagger: a model builds from the ground up; leaving a model, it dissolves from the top.
  float key = uKB == 1 ? mix(q0, clamp(0.5 + 0.5 * aB.y, 0.0, 1.0), 0.6)
            : uKA == 1 ? mix(q0, clamp(0.5 - 0.5 * aA.y, 0.0, 1.0), 0.6) : q0;
  const float S = 0.45;
  float t = clamp((uT - key * S) / (1.0 - S), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float sw = sin(3.14159265 * t);
  // A particle in both states cross-fades; one in only one state fades out early or in late.
  bool both = a.a > 0.001 && b.a > 0.001;
  float wa = both ? 1.0 - t : 1.0 - smoothstep(0.0, 0.5, t), wb = both ? t : smoothstep(0.5, 1.0, t);
  // Size travels geometrically and ink as energy (alpha × area), so an out-of-focus disc
  // sharpens into a speck on its way instead of swelling into a grey blot.
  float size = min(exp(mix(log(max(a.size, 0.5)), log(max(b.size, 0.5)), t)) * (1.0 + 0.6 * sw * q2), uMaxPt);
  float alpha = min(1.0, (a.a * a.size * a.size * wa + b.a * b.size * b.size * wb) / (size * size));
  alpha *= mix(uInk.x, uInk.y, t) * (1.0 + 0.25 * sw);
  vec2 ndc = mix(a.ndc, b.ndc, t);
  vec2 q = ndc * vec2(uAspect, 1.0);
  ndc += curl(q * 0.95 + vec2(q1, q2) * 0.3, uPhase + q3 * 1.2) * vec2(1.0 / uAspect, 1.0) * uSwirl * sw * (0.55 + 0.9 * q0);
  vCol = vec4(mix(a.col, b.col, t), alpha);
  vSize = size; vSoft = mix(a.soft, b.soft, t);
  gl_Position = vec4(ndc, 0.0, 1.0); gl_PointSize = size;
  if (alpha < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}`;

// ── The terrain's rigs and wells (hero only). v1's program, re-drawn as denser stipple. ───────
const RIG_VS = `#version 300 es
precision highp float; precision highp int;
uniform mat4 uVP; uniform float uFocus, uCoc, uFocal, uMaxPt, uSpeck, uPresence; uniform vec4 uHover;
uniform vec4 uRig[${BASE.maxRigs}], uBit[${BASE.maxRigs}]; uniform vec3 uPri, uRight;
layout(location = 0) in vec3 aLoc; layout(location = 1) in vec3 aMeta;   // meta: kind, t along well, slot
out vec4 vCol; out float vSize, vSoft;
${GLSL_NOISE}
void emit(vec3 p, float worldSize, float a, float r) {
  vec4 c = uVP * vec4(p, 1.0); float z = c.w;
  float base = max(worldSize * uFocal / max(z, 0.1), uSpeck * (0.8 + 0.5 * r));
  float coc = uCoc * abs(1.0 - uFocus / max(z, 0.1));
  float size = min(sqrt(base * base + coc * coc), uMaxPt);
  float e = base / size;
  a *= clamp(e * e, 0.1, 1.0) * (1.0 - smoothstep(${f(BASE.fogN)}, ${f(BASE.fogF)}, z)) * smoothstep(2.0, 9.0, z);
  vCol = vec4(uPri, a * uPresence * (0.55 + 0.45 * r)); vSize = size; vSoft = clamp(coc / size, 0.0, 1.0);
  gl_Position = c; gl_PointSize = size;
  if (vCol.a < 0.003 || z < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}
void main() {
  int s = int(aMeta.z + 0.5); vec4 R = uRig[s], B = uBit[s]; float h = R.w;
  float r = u16(hsh(ivec2(gl_VertexID, 31)), 0u);
  float near = mix(0.4, 1.0, smoothstep(10.0, 26.0, (uVP * vec4(R.xyz, 1.0)).w));   // rigs recede up close
  if (aMeta.x < 0.5) emit(R.xyz + uRight * aLoc.x + vec3(0.0, aLoc.y, 0.0), 0.03, mix(0.5, 1.0, h) * near, r);
  else if (aMeta.x < 1.5) emit(R.xyz + aLoc, 0.03, mix(0.18, 0.5, smoothstep(aMeta.y - 0.004, aMeta.y, B.w)) * mix(1.0, 2.0, h) * near, r);
  else emit(B.xyz, 0.13, mix(0.7, 1.0, h) * near, 1.0);
}`;

// Quiet zones: up to maxQuiet rectangles (device px, GL origin bottom-left) with a feather each.
// Inside a zone the field is attenuated by uQuietK; it sits in the shader rather than in a CSS
// scrim so the canvas pixels that were measured are the pixels the reader actually sees.
const FS = `#version 300 es
precision highp float;
in vec4 vCol; in float vSize, vSoft;
uniform vec4 uQuiet[${BASE.maxQuiet}]; uniform float uQuietF[${BASE.maxQuiet}]; uniform int uQuietN; uniform float uQuietK;
out vec4 o;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0), e = max(min(1.0, 2.0 / vSize), vSoft * 0.9);
  // Soft disc, blur radius = circle of confusion. A speck of a pixel or two is not a disc: soft
  // edges would eat most of its ink, so small points stay solid (film grain, not fuzz).
  float a = mix(1.0, 1.0 - smoothstep(1.0 - e, 1.0, r), smoothstep(1.5, 4.0, vSize));
  float keep = 1.0;
  for (int i = 0; i < ${BASE.maxQuiet}; i++) {
    if (i >= uQuietN) break;
    vec4 Q = uQuiet[i];
    vec2 q = abs(gl_FragCoord.xy - 0.5 * (Q.xy + Q.zw)) - 0.5 * (Q.zw - Q.xy);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    keep = min(keep, mix(1.0 - uQuietK, 1.0, smoothstep(0.0, uQuietF[i], d)));
  }
  o = vec4(vCol.rgb, vCol.a * a * keep);
  if (o.a < 0.002) discard;
}`;

interface Program {
  p: WebGLProgram;
  shaders: WebGLShader[];
  loc: Record<string, WebGLUniformLocation | null>;
}

interface Rig {
  key: string;
  x: number;
  z: number;
  y: number;
  at: (s: number) => Vec3;
  len: number;
  well: number[];
  derrick: number[];
  p0: number;
  hover: number;
  target: number;
  label: string;
  rel: Vec3;
  bit: Vec3;
  prog: number;
  screen: Vec3 | null;
  s0: Vec3 | null;
}

interface Camera {
  world: Vec2;
  eye: Vec3;
  fw: Vec3;
  rt: Vec3;
  up: Vec3;
  VP: number[];
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  feather: number;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
function mul(a: number[], b: number[]) {
  const o = new Array<number>(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const perspective = (fov: number, asp: number, n: number, fa: number) => {
  const t = 1 / Math.tan(fov / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0];
};
const lookAt = (eye: Vec3, fw: Vec3) => {
  const rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
  return {
    rt,
    up,
    V: [rt[0], up[0], -fw[0], 0, rt[1], up[1], -fw[1], 0, rt[2], up[2], -fw[2], 0, -dot(rt, eye), -dot(up, eye), dot(fw, eye), 1],
  };
};
/** Seeded shuffle for the terrain slots, so every load is the same field. */
function shuffle2(a: Float32Array, n: number) {
  let s = 0x9e3779b9;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const x = a[i * 2], y = a[i * 2 + 1];
    a[i * 2] = a[j * 2];
    a[i * 2 + 1] = a[j * 2 + 1];
    a[j * 2] = x;
    a[j * 2 + 1] = y;
  }
}
// Camera flies +z forever; the lateral drift is a function of distance, so the path is deterministic.
const drift = (d: number) => 9 * Math.sin(d / 173) + 4 * Math.sin(d / 61 + 1);
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Screen height (fraction from the top) a focused category surveys: in focus, and below the copy. */
const FOCUS_Y = 0.78;
const DEFAULT_FRAME = [0.1, 0.1, 0.9, 0.9] as const;
/** Model specks per CSS px² of framing box at which ink is not thinned (the desktop's). */
const MODEL_DENSITY = 0.2;
const DEFAULT_SEQUENCE: readonly FieldKey[] = FIELD_MODELS.map((model) => ({ model }));

export class FieldRenderer {
  readonly canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private scope: HTMLElement;
  private label: HTMLElement | null;
  private opts: { rigs: boolean; speed: number; interactive: boolean; density: number };
  private onFallback?: (why: string) => void;

  private gl: WebGL2RenderingContext | null = null;
  private partProg: Program | null = null;
  private rigProg: Program | null = null;
  private partVao: WebGLVertexArrayObject | null = null;
  private slotBuf: WebGLBuffer | null = null;
  private modelBufs = new Map<ModelId, WebGLBuffer>();
  /** Per model: how many of its particles fall inside each tier's prefix (for density). */
  private modelUsed = new Map<ModelId, number[]>();
  private rigVao: WebGLVertexArrayObject | null = null;
  private rigBuf: WebGLBuffer | null = null;
  private maxPt = 64;
  private probe: CanvasRenderingContext2D | null = null;
  private col = {
    background: [1, 1, 1] as Vec3,
    fg: [0, 0, 0] as Vec3,
    muted: [0.5, 0.5, 0.5] as Vec3,
    primary: [0, 0.4, 0.7] as Vec3,
    light: 1,
    terrainInk: 1,
    modelInk: 1,
    quiet: 0.95,
  };

  // Particles
  private capacity = TIERS[TIERS.length - 1] as number; // buffer size, fixed at init
  private areaBudget: number = TIERS[0]; // what this viewport would get on a capable GPU
  private tier = 0; // index into the tiers that fit the capacity
  private tiers: number[] = [];
  private cal = { on: true, skip: 12, iv: [] as number[] };
  private cell = 0.25;
  private slotAspect = 0;
  private pending: ModelId[] = [];
  private buildTimer = 0;
  private busyUntil = 0;

  // Sequence
  private seq: readonly FieldKey[] = DEFAULT_SEQUENCE;
  private target = 0;
  private progress = 0;
  private clock = 0;
  private stateLabel = "";
  private drawn = false;

  // Terrain
  private rigCache = new Map<string, Rig | null>();
  private rigs: Rig[] = [];
  private rigKey = "";
  private wellCount = 0;
  private derrickCount = 0;
  private rigU = new Float32Array(BASE.maxRigs * 4);
  private bitU = new Float32Array(BASE.maxRigs * 4);
  private quietU = new Float32Array(BASE.maxQuiet * 4);
  private quietF = new Float32Array(BASE.maxQuiet);

  private W = 1;
  private H = 1;
  private dpr = 1;
  private fixed = false;
  private reduced = false;
  private visible = true;
  private raf = 0;
  private last = 0;
  private ema = 16.7;
  private slowFrames = 0;
  private slow = false;
  /**
   * A software rasteriser (see init). Ambient idle motion — the flight, a settled model's sway or
   * spin — is off: measured in plain headless Chromium (SwiftShader), the 30 fps idle loop alone
   * kept the main thread ~99.8% busy (≈10% without it), which starves the page's own input and
   * scrolling on a VM or remote desktop. Everything that answers the reader stays: scroll morphs,
   * pointer swell, station survey, theme. Each settled state is its composed still.
   */
  private software = false;
  private stalled = false;
  private intervals: number[] = [];
  private wokeAt = 0;
  private D = 0;
  private D0 = 0;
  private ptr = { nx: 0, ny: 0, x: 0, y: 0, active: false, overUi: false };
  private par: Vec2 = [0, 0];
  private hov = { x: 0, z: 0, s: 0 };
  private focusX: number | null = null;
  private quiet: Rect[] = [];
  private quietEls: Element[] = [];
  private labelText = "";
  private labelW = 0;
  private labelOn = false;
  private destroyed = false;
  private failed = false;

  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private schemeMQ: MediaQueryList | null = null;
  private dprMQ: MediaQueryList | null = null;

  constructor(host: HTMLElement, options: FieldOptions = {}) {
    this.host = host;
    this.scope = options.scope ?? host.parentElement ?? host;
    this.label = options.label ?? null;
    this.opts = {
      rigs: options.rigs ?? true,
      speed: options.speed ?? 1,
      interactive: options.interactive ?? true,
      density: clamp(options.density ?? 1, 0.25, 1),
    };
    this.onFallback = options.onFallback;
    this.reduced = !!options.reduced;
    if (options.sequence?.length) this.seq = options.sequence;
    this.target = this.progress = this.clampP(options.progress ?? 0);
    if (this.reduced) this.progress = Math.round(this.progress);

    // Created here, never reused: a StrictMode remount gets a fresh canvas and context.
    this.canvas = document.createElement("canvas");
    this.canvas.className = "absolute inset-0 block size-full";
    this.canvas.setAttribute("aria-hidden", "true");
    host.prepend(this.canvas);

    try {
      this.init();
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "init failed");
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────────────────
  /** Continuous position in the sequence: 0 is the first stop, 1 the second, 1.5 halfway. */
  setProgress(p: number) {
    if (this.destroyed || this.failed || !Number.isFinite(p)) return;
    const t = this.clampP(p);
    if (t === this.target) return;
    this.target = t;
    // Arriving mid-page (a restored scroll position) shows that state, not a morph to it.
    if (!this.drawn) this.progress = t;
    if (this.reduced) {
      const snap = Math.round(t);
      if (snap === this.progress) return;
      this.progress = snap;
    } else this.ensureModels();
    this.requestRender();
  }

  setSequence(keys: readonly FieldKey[]) {
    if (this.destroyed || this.failed || !keys.length) return;
    this.seq = keys;
    this.target = this.clampP(this.target);
    this.progress = this.reduced ? Math.round(this.target) : this.clampP(this.progress);
    this.queueModels();
    this.requestRender();
  }

  setReduced(reduced: boolean) {
    if (this.destroyed || this.failed || reduced === this.reduced) return;
    this.reduced = reduced;
    this.D = this.D0; // back to the composed position, whichever way it toggled
    this.clock = 0;
    if (reduced) {
      this.par = [0, 0];
      this.hov.s = 0;
      this.progress = Math.round(this.target);
    }
    this.wake();
  }

  /** 0–1 across the field, or null. A category being hovered or focused surveys this column. */
  setFocus(x: number | null) {
    if (this.destroyed || this.failed) return;
    this.focusX = x === null ? null : clamp(x, 0.02, 0.98);
    if (!this.running()) this.requestRender();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.buildTimer);
    this.io?.disconnect();
    this.ro?.disconnect();
    this.mo?.disconnect();
    this.schemeMQ?.removeEventListener("change", this.readColours);
    this.dprMQ?.removeEventListener("change", this.onDprChange);
    this.scope.removeEventListener("pointermove", this.onPointerMove);
    this.scope.removeEventListener("pointerleave", this.onPointerLeave);
    this.scope.removeEventListener("animationend", this.refreshQuiet);
    this.scope.removeEventListener("transitionend", this.refreshQuiet);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("scroll", this.onScroll);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      for (const P of [this.partProg, this.rigProg]) {
        if (!P) continue;
        for (const s of P.shaders) gl.deleteShader(s);
        gl.deleteProgram(P.p);
      }
      gl.deleteBuffer(this.slotBuf);
      for (const b of this.modelBufs.values()) gl.deleteBuffer(b);
      gl.deleteBuffer(this.rigBuf);
      gl.deleteVertexArray(this.partVao);
      gl.deleteVertexArray(this.rigVao);
      gl.getExtension("WEBGL_lose_context")?.loseContext(); // release the context now, not at GC
    }
    this.modelBufs.clear();
    this.gl = null;
    this.rigCache.clear();
    this.canvas.remove();
    if (this.label) this.label.dataset.on = "false";
  }

  // ── Setup ───────────────────────────────────────────────────────────────────────────────
  private init() {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }
    if (!gl) return this.fail("WebGL2 unavailable");
    this.gl = gl;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);

    this.partProg = this.program(PARTICLE_VS, FS);
    this.rigProg = this.program(RIG_VS, FS);
    this.maxPt = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    this.partVao = gl.createVertexArray();
    this.slotBuf = gl.createBuffer();
    this.rigVao = gl.createVertexArray();
    this.rigBuf = gl.createBuffer();

    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!probe) return this.fail("no 2D probe");
    probe.canvas.width = probe.canvas.height = 1;
    this.probe = probe;

    // The particle budget: by viewport area (a phone needs a third of a desktop's specks for the
    // same grain), then whatever the first frames prove the device can hold. A software
    // rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render Driver: a VM, a remote desktop,
    // a blocklisted driver) starts, and stays, at the lowest tier.
    const area = (window.innerWidth * window.innerHeight) / (1440 * 900);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererName);
    this.software = software;
    if (software) this.cal.on = false; // one tier: nothing to calibrate
    this.areaBudget = TIERS[0] * Math.min(1, area) * this.opts.density;
    const budget = software ? 0 : this.areaBudget;
    this.capacity = TIERS.find((t) => t <= Math.max(budget, TIERS[TIERS.length - 1])) ?? TIERS[TIERS.length - 1];
    this.tiers = TIERS.filter((t) => t <= this.capacity);
    this.tier = 0;

    // Theme can change by class on <html> (the viewer's toggle) or by OS scheme.
    this.mo = new MutationObserver(this.readColours);
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    this.schemeMQ = matchMedia("(prefers-color-scheme: dark)");
    this.schemeMQ.addEventListener("change", this.readColours);

    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.wake();
    });
    this.io.observe(this.canvas);
    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(this.host);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.scope.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.scope.addEventListener("pointerleave", this.onPointerLeave);
    // Entrance reveals move the copy by transform, which ResizeObserver cannot see.
    this.scope.addEventListener("animationend", this.refreshQuiet);
    this.scope.addEventListener("transitionend", this.refreshQuiet);
    document.fonts?.ready.then(() => this.refreshQuiet()).catch(() => {});
    this.watchDpr();

    gl.bindVertexArray(this.partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.slotBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.readColours();
    this.resize();
    this.D0 = this.composedStart();
    this.D = this.D0;
    this.queueModels();
    this.ensureModels();
    this.publishStats();
    this.wake();
  }

  private program(vs: string, fs: string): Program {
    const gl = this.gl!;
    const p = gl.createProgram();
    if (!p) throw new Error("createProgram failed");
    const shaders: WebGLShader[] = [];
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type);
      if (!s) throw new Error("createShader failed");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "compile failed");
      gl.attachShader(p, s);
      shaders.push(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
    const loc: Program["loc"] = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      if (info) loc[info.name.replace("[0]", "")] = gl.getUniformLocation(p, info.name);
    }
    return { p, shaders, loc };
  }

  private fail(why: string) {
    if (this.failed) return;
    this.failed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.buildTimer);
    this.canvas.style.display = "none";
    console.info("[field] static fallback:", why);
    this.onFallback?.(why);
  }

  // ── Colours: read from CSS custom properties, resolved through a 1×1 canvas so any CSS colour
  //    syntax (oklch included) arrives as sRGB. Re-read whenever the theme can have changed. ────
  private readColours = () => {
    const probe = this.probe;
    if (!probe || this.destroyed) return;
    const cs = getComputedStyle(this.canvas);
    const read = (name: string): Vec3 => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "transparent";
      probe.fillStyle = cs.getPropertyValue(`--${name}`).trim();
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      return [r / 255, g / 255, b / 255];
    };
    const c = this.col;
    c.background = read("background");
    c.fg = read("foreground");
    c.muted = read("muted-foreground");
    c.primary = read("primary");
    const [r, g, b] = c.background;
    c.light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 1 : 0;
    const num = (name: string, d: number) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isNaN(v) ? d : v;
    };
    c.terrainInk = num("--terrain-ink", 1);
    c.modelInk = num("--model-ink", 1);
    c.quiet = num("--terrain-quiet", 0.95);
    this.requestRender();
  };

  // ── Terrain slots: a trapezoid of lattice cells covering the view, sized so it holds the
  //    whole particle buffer. Rows run near→far, the farthest are dropped to fit, then the slots
  //    are shuffled so any prefix is a fair, uniform thinning. Re-anchored to the camera every
  //    frame in whole 2-cell steps, so points never swim and new rows arrive in fog. ───────────
  private buildSlots(aspect: number) {
    const gl = this.gl!, N = this.capacity;
    const tanX = Math.tan(BASE.fov / 2) * aspect + 0.12;
    const rows = (cell: number, visit?: (i: number, j: number) => boolean) => {
      let n = 0;
      for (let j = Math.floor(BASE.zNear / cell); j <= Math.ceil(BASE.zFar / cell); j++) {
        const w = 2 * Math.ceil((Math.max(j * cell, 0) * tanX + 12) / cell / 2), lod = j * cell > BASE.lodZ + 2;
        if (lod && j & 1) continue;
        if (!visit) {
          n += lod ? w + 1 : 2 * w + 1;
          continue;
        }
        for (let i = -w; i <= w; i += lod ? 2 : 1) if (!visit(i, j)) return n;
      }
      return n;
    };
    let lo = 0.04, hi = 2;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (rows(mid) > N) lo = mid;
      else hi = mid;
    }
    const cell = lo; // the largest cell that still fills the buffer
    const slots = new Float32Array(N * 2);
    let k = 0;
    rows(cell, (i, j) => {
      slots[k * 2] = i;
      slots[k * 2 + 1] = j;
      return ++k < N;
    });
    shuffle2(slots, k);
    this.cell = cell;
    this.slotAspect = aspect;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.slotBuf);
    gl.bufferData(gl.ARRAY_BUFFER, slots, gl.STATIC_DRAW);
  }

  // ── Models: built in the background one per task, in sequence order; built at once if a
  //    transition needs one first. Sampling is cached per module, so a remount is instant. ────
  private queueModels() {
    const want = this.seq.map((k) => k.model).filter((m): m is ModelId => m !== "terrain");
    this.pending = [...new Set(want)].filter((m) => !this.modelBufs.has(m));
    clearTimeout(this.buildTimer);
    const next = () => {
      if (this.destroyed || this.failed) return;
      const id = this.pending.shift();
      if (!id) return;
      this.upload(id);
      this.buildTimer = window.setTimeout(next, 30);
    };
    this.buildTimer = window.setTimeout(next, 60);
  }

  private upload(id: ModelId) {
    if (this.modelBufs.has(id) || !this.gl) return;
    const t0 = performance.now();
    const data = buildModel(id, this.capacity);
    this.modelUsed.set(
      id,
      this.tiers.map((n) => {
        let c = 0;
        for (let i = 0; i < n; i++) if (data[i * 4 + 3] > -0.5) c++;
        return c;
      }),
    );
    const gl = this.gl, buf = gl.createBuffer();
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.modelBufs.set(id, buf);
    // A frame that waited on this is not evidence about the GPU.
    this.busyUntil = performance.now() + (performance.now() - t0) + 40;
  }

  /** The two models either side of the target, built now if the background has not got there. */
  private ensureModels() {
    const s = Math.floor(this.target), keys = [this.seq[s], this.seq[s + 1], this.seq[Math.floor(this.progress)]];
    for (const k of keys) if (k && k.model !== "terrain") this.upload(k.model);
  }

  // ── Rigs: one hashed candidate per world tile, so the same rigs are always in the same places.
  private rigAt(tx: number, tz: number): Rig | null {
    const key = `${tx},${tz}`;
    const cached = this.rigCache.get(key);
    if (cached !== undefined) return cached;
    const r = (k: number) => (hsh(tx * 73 + k * 19349, tz * 151 - k * 7919) >>> 8) / 16777215;
    let rig: Rig | null = null;
    if (r(0) < BASE.rigChance) {
      const x = (tx + 0.2 + 0.6 * r(1)) * BASE.rigTile, z = (tz + 0.2 + 0.6 * r(2)) * BASE.rigTile;
      // Laterals run across the line of flight (+z), so every profile reads side-on.
      const az = (r(3) < 0.5 ? 1 : -1) * (Math.PI / 2) + (r(13) * 2 - 1) * BASE.lateralSpread;
      const dx = Math.sin(az), dz = Math.cos(az), horiz = r(4) < 0.7;
      const kop = 1.2 + r(5) * 1.4, R = 2 + r(6) * 1.6, inc = horiz ? Math.PI / 2 : 0.6 + r(7) * 0.45;
      const lat = horiz ? 6 + r(8) * 9 : 4 + r(8) * 4, arc = R * inc, len = kop + arc + lat;
      const at = (s: number): Vec3 => {
        // well path: vertical, build, then hold/lateral
        if (s <= kop) return [0, -s, 0];
        if (s <= kop + arc) {
          const p = (s - kop) / R, hz = R * (1 - Math.cos(p));
          return [dx * hz, -(kop + R * Math.sin(p)), dz * hz];
        }
        const q = s - kop - arc, hz = R * (1 - Math.cos(inc)) + q * Math.sin(inc);
        return [dx * hz, -(kop + R * Math.sin(inc) + q * Math.cos(inc)), dz * hz];
      };
      // Stipple: random points along the path and the struts, jittered off the line.
      const well: number[] = [], derrick: number[] = [];
      let seed = hsh(tx * 31 + 7, tz * 17 - 3);
      const u = () => ((seed = hsh(seed, 0x51ed27)) >>> 8) / 16777215;
      for (let i = 0, n = Math.round(len / 0.028); i < n; i++) {
        const s = u() * len, p = at(s), j = 0.028;
        well.push(p[0] + (u() - 0.5) * j, p[1] + (u() - 0.5) * j, p[2] + (u() - 0.5) * j, 1, s / len);
      }
      const W0 = 0.52, W1 = 0.1, H = 1.9, wAt = (y: number) => W0 + ((W1 - W0) * y) / H;
      const seg = (x0: number, y0: number, x1: number, y1: number) => {
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.022));
        for (let i = 0; i < n; i++) {
          const t = u();
          derrick.push(x0 + (x1 - x0) * t + (u() - 0.5) * 0.02, y0 + (y1 - y0) * t + (u() - 0.5) * 0.02, 0, 0, 0);
        }
      };
      seg(-W0, 0, -W1, H);
      seg(W0, 0, W1, H);
      seg(-0.8, 0, 0.8, 0);
      seg(-0.18, H, 0.18, H);
      seg(0, H, 0, H + 0.18);
      for (let k = 0, y0 = 0.08; k < 3; k++) {
        const y1 = y0 + (H - 0.08) / 3;
        seg(-wAt(y0), y0, wAt(y1), y1);
        seg(wAt(y0), y0, -wAt(y1), y1);
        y0 = y1;
      }
      const md = Math.round((len * BASE.mPerUnit) / 10) * 10;
      rig = {
        key, x, z, y: height(x, z), at, len, well, derrick, p0: 0.3 + r(9) * 0.3, hover: 0, target: 0,
        // Obviously fake sample IDs — no real contractor prefix, no real field code.
        label: `RIG-${pad(1 + Math.floor(r(10) * 40), 2)} · WELL-${pad(Math.floor(r(12) * 10000), 4)} · ${md.toLocaleString("en-GB")} m MD`,
        rel: [0, 0, 0], bit: [0, 0, 0], prog: 0, screen: null, s0: null,
      };
    }
    this.rigCache.set(key, rig);
    return rig;
  }

  private uploadRigs(list: Rig[]) {
    const gl = this.gl!;
    const wells: number[] = [], derricks: number[] = [];
    list.forEach((rig, slot) => {
      for (let i = 0; i < rig.well.length; i += 5) wells.push(rig.well[i], rig.well[i + 1], rig.well[i + 2], 1, rig.well[i + 4], slot);
      wells.push(0, 0, 0, 2, 0, slot); // the bit: position comes from uBit
      for (let i = 0; i < rig.derrick.length; i += 5) derricks.push(rig.derrick[i], rig.derrick[i + 1], 0, 0, 0, slot);
    });
    this.wellCount = wells.length / 6;
    this.derrickCount = derricks.length / 6;
    gl.bindVertexArray(this.rigVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rigBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wells.concat(derricks)), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  }

  // ── Cameras. The terrain is rendered relative to its camera to keep float precision. ──────
  private cameraAt(d: number, par: Vec2): Camera {
    const yaw = Math.atan(drift(d + 0.5) - drift(d - 0.5)) * 0.6 - par[0] * 0.012, pitch = BASE.pitch + par[1] * 0.01;
    const fw: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const eye: Vec3 = [-par[0], BASE.camH + par[1], 0];
    const { rt, up, V } = lookAt(eye, fw);
    return { world: [drift(d), d], eye, fw, rt, up, VP: mul(perspective(BASE.fov, this.W / this.H, 0.5, 400), V) };
  }

  /** A model's projection into its own framing box (aspect = the model's), plus its eye distance. */
  private modelCamera(id: ModelId) {
    const v = modelView(id);
    const idle = this.reduced ? 0 : v.spin ? v.spin * this.clock : v.sway * Math.sin(this.clock * 0.16);
    const yaw = v.yaw + idle;
    const eye: Vec3 = [
      v.target[0] + v.dist * Math.cos(v.pitch) * Math.sin(yaw),
      v.target[1] + v.dist * Math.sin(v.pitch),
      v.target[2] + v.dist * Math.cos(v.pitch) * Math.cos(yaw),
    ];
    const { V } = lookAt(eye, norm([v.target[0] - eye[0], v.target[1] - eye[1], v.target[2] - eye[2]]));
    return { M: mul(perspective(v.fov, v.aspect, 0.05, 50), V), z: v.dist };
  }

  /** The fitted frame for a model, in NDC: centre xy, half-size xy. */
  private frameOf(key: FieldKey) {
    if (key.model === "terrain") return [0, 0, 1, 1];
    const [l, t, r, b] = key.frame ?? DEFAULT_FRAME;
    const a = modelView(key.model).aspect, fw = (r - l) * this.W, fh = (b - t) * this.H;
    const h = Math.min(fh, fw / a), w = h * a;
    return [((l + r) / 2) * 2 - 1, 1 - ((t + b) / 2) * 2, w / this.W, h / this.H];
  }

  /** Camera-relative point → CSS px (and clip w). */
  private project(cam: Camera, p: Vec3): Vec3 | null {
    const m = cam.VP, w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w < 0.5) return null;
    return [
      (((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w) * 0.5 + 0.5) * this.W,
      (0.5 - ((m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w) * 0.5) * this.H,
      w,
    ];
  }

  /** Screen ray → terrain hit (camera-relative xz). */
  private pick(cam: Camera, nx: number, ny: number): Vec2 | null {
    const ty = Math.tan(BASE.fov / 2), tx = (ty * this.W) / this.H;
    const d = norm([0, 1, 2].map((i) => cam.fw[i] + cam.rt[i] * nx * tx + cam.up[i] * ny * ty) as Vec3);
    const below = (t: number) => cam.eye[1] + d[1] * t < height(cam.world[0] + cam.eye[0] + d[0] * t, cam.world[1] + d[2] * t);
    let t0 = 1, t1 = 1;
    for (; t1 < BASE.fogF; t0 = t1, t1 += 0.4 + t1 * 0.02) if (below(t1)) break;
    if (t1 >= BASE.fogF) return null;
    for (let i = 0; i < 8; i++) {
      const m = (t0 + t1) / 2;
      if (below(m)) t1 = m;
      else t0 = m;
    }
    return [cam.eye[0] + d[0] * t1, cam.eye[2] + d[2] * t1];
  }

  private rigsNear(cam: Camera): Rig[] {
    if (!this.opts.rigs) return [];
    const [cx, cz] = cam.world, T = BASE.rigTile, tanX = (Math.tan(BASE.fov / 2) * this.W) / this.H + 0.15, out: Rig[] = [];
    for (let tz = Math.floor((cz - 12) / T); tz <= Math.floor((cz + BASE.zFar) / T); tz++) {
      const hw = Math.max(0, tz * T + T - cz) * tanX + 16;
      for (let tx = Math.floor((cx - hw) / T); tx <= Math.floor((cx + hw) / T); tx++) {
        const rig = this.rigAt(tx, tz);
        if (!rig) continue;
        const rz = rig.z - cz;
        if (rz > -12 && rz < BASE.zFar && Math.abs(rig.x - cx) < Math.max(rz, 0) * tanX + 16) out.push(rig);
      }
    }
    if (this.rigCache.size > 400)
      for (const [k, r] of this.rigCache) if (!r || r.z < cz - 60) this.rigCache.delete(k); // tiles left behind
    return out.sort((a, b) => a.z - b.z).slice(0, BASE.maxRigs);
  }

  /**
   * A well-composed start: the first distance where 3–5 rigs sit in the readable band, clear of
   * every quiet zone (on narrow viewports that may never happen; then the distance closest to it).
   */
  private composedStart() {
    if (!this.opts.rigs) return 0;
    let best = 0, bestScore = Infinity;
    const { W, H } = this;
    const quiet = this.viewportQuiet();
    for (let d = 0; d < 3000; d += 7) {
      const cam = this.cameraAt(d, [0, 0]);
      const ok = this.rigsNear(cam).filter((rig) => {
        const s = this.project(cam, [rig.x - cam.world[0], rig.y + 1, rig.z - cam.world[1]]);
        if (!s || s[2] < 22 || s[2] > 105 || s[0] < W * 0.08 || s[0] > W * 0.92 || s[1] < H * 0.4 || s[1] > H * 0.9) return false;
        return !quiet.some((q) => s[0] > q.left - 40 && s[0] < q.right + 40 && s[1] > q.top - 60 && s[1] < q.bottom + 40);
      }).length;
      const lo = W >= 1000 ? 3 : 2, score = ok < lo ? lo - ok : Math.max(0, ok - 5);
      if (score === 0) return d;
      if (score < bestScore) {
        best = d;
        bestScore = score;
      }
    }
    return best;
  }

  // ── Input, lifecycle. ────────────────────────────────────────────────────────────────────
  private clampP = (p: number) => clamp(p, 0, this.seq.length - 1);
  private running = () =>
    !this.reduced && !this.stalled && this.visible && !document.hidden && !this.failed && !this.destroyed;
  private requestRender = () => {
    if (!this.raf && !this.failed && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  };
  private wake = () => {
    this.last = 0;
    // Coming back into view (or to the tab) is a fresh chance to move.
    this.stalled = false;
    this.intervals.length = 0;
    this.wokeAt = performance.now();
    this.requestRender();
  };
  private onVisibility = () => {
    if (!document.hidden) this.wake();
  };
  private onScroll = () => {
    // A fixed canvas does not move, but the quiet zones scroll past it.
    if (this.fixed && this.quiet.length) this.requestRender();
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.fail("context lost");
  };
  private onDprChange = () => {
    this.resize();
    this.watchDpr();
  };
  private watchDpr() {
    this.dprMQ?.removeEventListener("change", this.onDprChange);
    this.dprMQ = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprMQ.addEventListener("change", this.onDprChange);
  }
  private onResize = () => this.resize();
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" || !this.opts.interactive) return;
    const c = this.canvas.getBoundingClientRect();
    const p = this.ptr;
    p.x = e.clientX - c.left;
    p.y = e.clientY - c.top;
    p.nx = (p.x / this.W) * 2 - 1;
    p.ny = 1 - (p.y / this.H) * 2;
    p.active = p.y >= 0 && p.y <= this.H && p.x >= 0 && p.x <= this.W;
    // Over copy or a control: no swell and no rig label under the reader's text.
    const t = e.target instanceof Element ? e.target : null;
    p.overUi = !!t?.closest("[data-terrain-quiet], a, button");
    if (!this.running() || !this.raf) this.requestRender();
  };
  private onPointerLeave = () => {
    this.ptr.active = false;
    this.requestRender();
  };

  /**
   * Quiet rectangles, measured when layout settles (never on scroll). For a fixed canvas they are
   * kept in page coordinates and shifted by the scroll offset at draw time; otherwise they are
   * relative to the canvas, which scrolls with them.
   */
  private rectOf(el: Element): Rect {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    const attr = Number(el.getAttribute("data-terrain-quiet"));
    const feather = (attr > 0 ? attr : 140) * Math.min(1, Math.max(0.4, this.W / 1200));
    const oy = this.fixed ? window.scrollY : -c.top, ox = this.fixed ? 0 : -c.left;
    return { left: r.left + ox, right: r.right + ox, top: r.top + oy, bottom: r.bottom + oy, feather };
  }
  refreshQuiet = () => {
    if (this.destroyed || this.failed) return;
    // Re-queried each time, so zones the page renders later are picked up (at most maxQuiet).
    const els = Array.from(this.scope.querySelectorAll("[data-terrain-quiet]")).slice(0, BASE.maxQuiet);
    for (const el of els) if (!this.quietEls.includes(el)) this.ro?.observe(el);
    for (const el of this.quietEls) if (!els.includes(el)) this.ro?.unobserve(el);
    this.quietEls = els;
    this.quiet = els.map((el) => this.rectOf(el));
    this.requestRender();
  };
  private viewportQuiet(): Rect[] {
    if (!this.fixed) return this.quiet;
    const y = window.scrollY;
    return this.quiet.map((q) => ({ ...q, top: q.top - y, bottom: q.bottom - y }));
  }

  private resize() {
    const gl = this.gl;
    if (!gl || this.destroyed) return;
    this.fixed = getComputedStyle(this.host).position === "fixed";
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // DPR capped at 2
    this.W = Math.max(1, this.host.clientWidth);
    this.H = Math.max(1, this.host.clientHeight);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (Math.abs(this.W / this.H - this.slotAspect) > 0.05) this.buildSlots(this.W / this.H);
    this.refreshQuiet();
  }

  /** Where the sequence stands: the two keys either side, and how far between them. */
  private segment() {
    const n = this.seq.length;
    if (n < 2) return { A: this.seq[0], B: this.seq[0], T: 0, i: 0 };
    const p = this.progress, i = Math.min(Math.floor(p), n - 2);
    return { A: this.seq[i], B: this.seq[i + 1], T: clamp(p - i, 0, 1), i };
  }

  private update(dt: number) {
    const reduced = this.reduced || this.stalled, ptr = this.ptr, par = this.par, hov = this.hov;
    const ease = (tau: number) => (reduced ? 1 : 1 - Math.exp(-dt / tau));
    // Progress eases toward the scroll position, then stops: it moves only while scrolling.
    if (reduced) this.progress = Math.round(this.target);
    else {
      this.progress += (this.target - this.progress) * ease(BASE.ease);
      if (Math.abs(this.target - this.progress) < 4e-4) this.progress = this.target;
    }
    const { A, B, T } = this.segment();
    const wT = (A.model === "terrain" ? 1 - T : 0) + (B.model === "terrain" ? T : 0);
    const settled = T === 0 || T === 1;
    const onTerrain = settled && wT > 0.999;
    const modelShown = wT < 0.999 && Math.max(A.ink ?? 1, B.ink ?? 1) > 0.001;
    if (this.running() && onTerrain && !this.software) this.D += BASE.speed * this.opts.speed * dt; // frozen otherwise
    if (!reduced && modelShown && !this.software) this.clock += dt;

    let cam: Camera | null = null;
    if (wT <= 0.0005) this.placeLabel(null);
    else {
      const pointerLive = onTerrain && ptr.active && !ptr.overUi && this.opts.interactive;
      const tp: Vec2 = reduced || !onTerrain || !ptr.active || !this.opts.interactive ? [0, 0] : [ptr.nx * BASE.parallax[0], ptr.ny * BASE.parallax[1]];
      par[0] += (tp[0] - par[0]) * ease(0.9);
      par[1] += (tp[1] - par[1]) * ease(0.9);
      cam = this.cameraAt(this.D, par);
      const [cx, cz] = cam.world;
      // Swell: a focused category surveys the column above it; otherwise the pointer. Eased in
      // world space so the camera's motion does not drag it. None under reduced motion.
      let hit: Vec2 | null = null;
      if (!reduced && onTerrain && this.focusX !== null) hit = this.pick(cam, this.focusX * 2 - 1, 1 - FOCUS_Y * 2);
      else if (!reduced && pointerLive) hit = this.pick(cam, ptr.nx, ptr.ny);
      if (hit) {
        if (hov.s < 0.02) {
          hov.x = hit[0] + cx;
          hov.z = hit[1] + cz;
        }
        hov.x += (hit[0] + cx - hov.x) * ease(0.18);
        hov.z += (hit[1] + cz - hov.z) * ease(0.18);
      }
      hov.s += ((hit ? 1 : 0) - hov.s) * ease(0.45);
      const swellAt = (x: number, z: number) => hov.s * Math.exp(-((x - hov.x) ** 2 + (z - hov.z) ** 2) / BASE.swellR ** 2) * BASE.swellH;
      // Rigs: the active set, hover picking in screen space, bit progress tied to approach.
      const list = this.rigsNear(cam), key = list.map((r) => r.key).join("|");
      if (key !== this.rigKey) {
        this.rigKey = key;
        this.rigs = list;
        this.uploadRigs(list);
      }
      let best: Rig | null = null, bestD = Infinity;
      const focusBoost = this.focusX !== null && onTerrain ? 0.35 : 0; // a focused category gently lifts every rig
      for (const rig of this.rigs) {
        const lift = swellAt(rig.x, rig.z), base: Vec3 = [rig.x - cx, rig.y + lift, rig.z - cz];
        rig.rel = base;
        rig.prog = Math.min(1, rig.p0 + 0.35 * (1 - Math.max(0, base[2]) / BASE.zFar));
        const b = rig.at(rig.prog * rig.len);
        rig.bit = [base[0] + b[0], base[1] + b[1], base[2] + b[2]];
        const s0 = this.project(cam, base), s1 = this.project(cam, [base[0], base[1] + 2.1, base[2]]);
        rig.screen = s1;
        rig.s0 = s0;
        rig.target = focusBoost;
        if (!pointerLive || !s0 || !s1 || s0[2] > BASE.fogF * 0.8) continue;
        const vx = s1[0] - s0[0], vy = s1[1] - s0[1];
        const t = clamp(((ptr.x - s0[0]) * vx + (ptr.y - s0[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1);
        const dd = Math.hypot(ptr.x - s0[0] - vx * t, ptr.y - s0[1] - vy * t);
        if (dd < Math.max(26, Math.abs(vy) * 0.45) && dd < bestD) {
          best = rig;
          bestD = dd;
        }
      }
      if (best) best.target = 1;
      for (const rig of this.rigs) rig.hover += (rig.target - rig.hover) * ease(0.3);
      this.placeLabel(best);
    }
    return { cam, A, B, T, wT, settled, onTerrain, modelShown };
  }

  private placeLabel(best: Rig | null) {
    const el = this.label;
    if (!el) return;
    if (best && best.screen) {
      if (this.labelText !== best.label) {
        el.textContent = best.label;
        this.labelText = best.label;
        this.labelW = el.offsetWidth;
      }
      const lx = Math.min(best.screen[0] + 14, this.W - this.labelW - 8), ly = Math.max(8, best.screen[1] - 14);
      el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
    }
    const on = !!best;
    if (on !== this.labelOn) {
      this.labelOn = on;
      el.dataset.on = on ? "true" : "false";
    }
  }

  private bindModel(loc: number, key: FieldKey) {
    const gl = this.gl!;
    const buf = key.model === "terrain" ? undefined : this.modelBufs.get(key.model);
    if (buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(loc);
      gl.vertexAttrib4f(loc, 0, 0, 0, -1);
    }
    return key.model === "terrain" ? 0 : 1;
  }

  private draw(s: ReturnType<FieldRenderer["update"]>) {
    const gl = this.gl!, P = this.partProg!, R = this.rigProg!, c = this.col;
    const { cam, A, B, T, wT } = s;
    const bg = c.background, dpr = this.dpr, H = this.H;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const ink = (A.ink ?? 1) + ((B.ink ?? 1) - (A.ink ?? 1)) * T;
    if (ink < 0.002) return;
    const quiet = this.viewportQuiet().filter((q) => q.bottom > -q.feather && q.top < H + q.feather);
    const n = Math.min(quiet.length, BASE.maxQuiet);
    for (let i = 0; i < n; i++) {
      const q = quiet[i];
      this.quietU.set([q.left * dpr, (H - q.bottom) * dpr, q.right * dpr, (H - q.top) * dpr], i * 4);
      this.quietF[i] = Math.max(1, q.feather * dpr);
    }
    const focal = this.canvas.height / 2 / Math.tan(BASE.fov / 2);
    const common = (Pr: Program) => {
      const L = Pr.loc;
      gl.useProgram(Pr.p);
      if (cam) gl.uniformMatrix4fv(L.uVP, false, cam.VP);
      gl.uniform1f(L.uFocus, BASE.focus);
      gl.uniform1f(L.uCoc, BASE.coc * this.canvas.height);
      gl.uniform1f(L.uFocal, focal);
      gl.uniform1f(L.uMaxPt, Math.min(this.maxPt, 22 * dpr));
      gl.uniform1f(L.uSpeck, BASE.speck * dpr);
      gl.uniform3fv(L.uPri, c.primary);
      gl.uniform4fv(L.uQuiet, this.quietU);
      gl.uniform1fv(L.uQuietF, this.quietF);
      gl.uniform1i(L.uQuietN, n);
      gl.uniform1f(L.uQuietK, c.quiet);
      if (cam) gl.uniform4f(L.uHover, this.hov.x - cam.world[0], this.hov.z - cam.world[1], this.hov.s, BASE.swellR);
    };
    const rigsOn = !!cam && wT > 0.002 && this.rigs.length > 0;
    const rigPass = (first: number, count: number) => {
      if (!count || !cam) return;
      common(R);
      gl.uniform1f(R.loc.uPresence, wT * wT * c.terrainInk * ink);
      gl.uniform4fv(R.loc.uRig, this.rigU);
      gl.uniform4fv(R.loc.uBit, this.bitU);
      gl.uniform3fv(R.loc.uRight, cam.rt);
      gl.bindVertexArray(this.rigVao);
      gl.drawArrays(gl.POINTS, first, count);
    };
    if (rigsOn) {
      this.rigU.fill(0);
      this.bitU.fill(0);
      this.rigs.forEach((r, i) => {
        this.rigU.set([...r.rel, r.hover], i * 4);
        this.bitU.set([...r.bit, r.prog], i * 4);
      });
      rigPass(0, this.wellCount); // wells under the field
    }

    common(P);
    const L = P.loc;
    if (cam) {
      const ox = Math.floor(cam.world[0] / this.cell / 2) * 2, oz = Math.floor(cam.world[1] / this.cell / 2) * 2; // even origin: LOD parity is world-stable
      gl.uniform2i(L.uOI, ox, oz);
      gl.uniform2f(L.uCamRel, cam.world[0] - ox * this.cell, cam.world[1] - oz * this.cell);
      gl.uniform3fv(L.uEye, cam.eye);
    }
    gl.uniform1f(L.uCell, this.cell);
    gl.uniform3fv(L.uSun, sunN);
    gl.uniform1f(L.uLight, c.light);
    gl.uniform3fv(L.uFg, c.fg);
    gl.uniform3fv(L.uMuted, c.muted);
    // A lower tier draws fewer terrain specks over the same ground: each carries a little more ink.
    const count = this.tiers[this.tier] ?? this.capacity;
    gl.uniform1f(L.uTerrainInk, c.terrainInk * clamp(Math.sqrt(this.areaBudget / count), 1, 1.8));
    gl.uniform1f(L.uModelInk, c.modelInk);
    gl.uniform1f(L.uAspect, this.W / this.H);
    gl.uniform1f(L.uT, T);
    gl.uniform1f(L.uPhase, this.progress * 2.4);
    gl.uniform1f(L.uSwirl, this.reduced ? 0 : BASE.swirl);
    gl.uniform2f(L.uInk, A.ink ?? 1, B.ink ?? 1);
    gl.bindVertexArray(this.partVao);
    const kA = this.bindModel(1, A), kB = this.bindModel(2, B);
    gl.uniform1i(L.uKA, kA);
    gl.uniform1i(L.uKB, kB);
    const zs = [1, 1], dens = [1, 1];
    [A, B].forEach((k, i) => {
      if (k.model === "terrain") return;
      const m = this.modelCamera(k.model), F = this.frameOf(k);
      zs[i] = m.z;
      // The same specks in a smaller frame (a phone) would pile up into a grey blot: thin the
      // ink back towards the desktop's specks-per-pixel.
      const used = this.modelUsed.get(k.model)?.[this.tier] ?? 0, area = F[2] * this.W * F[3] * this.H;
      dens[i] = area > 0 ? clamp(MODEL_DENSITY / (used / area), 0.35, 1) : 1;
      gl.uniformMatrix4fv(i ? L.uMB : L.uMA, false, m.M);
      gl.uniform4fv(i ? L.uFB : L.uFA, F);
    });
    gl.uniform2f(L.uZ, zs[0], zs[1]);
    gl.uniform2f(L.uDens, dens[0], dens[1]);
    gl.drawArrays(gl.POINTS, 0, count);

    if (rigsOn) rigPass(this.wellCount, this.derrickCount); // derricks on top
  }

  private publishStats() {
    const d = this.canvas.dataset;
    d.particles = String(this.tiers[this.tier] ?? this.capacity);
    d.capacity = String(this.capacity);
  }

  /**
   * Frame pacing. Ambient motion (the flight, a settled model's sway or spin) is drawn at 30 fps;
   * scrolling (a morph in progress), the pointer, a surveyed station, an easing swell and the
   * first-frames calibration get the full display rate. If even that cannot be held at the
   * lowest tier, the field stays at 30 fps for good; and if even 30 fps collapses (the median
   * drawn frame slower than ~14 fps) motion stops until the field next comes into view.
   */
  private minInterval(moving: boolean) {
    const interacting =
      moving || this.cal.on || (this.ptr.active && this.opts.interactive) || this.focusX !== null || this.hov.s > 0.02;
    return interacting && !this.slow ? 0 : 1000 / 30;
  }

  private calibrate(iv: number, now: number) {
    const c = this.cal;
    if (!c.on) return;
    if (c.skip > 0 || now < this.busyUntil || iv > 250) {
      c.skip = Math.max(0, c.skip - 1);
      return;
    }
    c.iv.push(iv);
    const sorted = () => [...c.iv].sort((a, b) => a - b);
    const done = c.iv.length >= 45 || (c.iv.length >= 10 && sorted()[c.iv.length >> 1] > 40);
    if (!done) return;
    const median = sorted()[c.iv.length >> 1];
    if (median > 21 && this.tier < this.tiers.length - 1) {
      // Far off the budget: straight to the lowest tier rather than a second slow round.
      this.tier = median > 45 ? this.tiers.length - 1 : this.tier + 1;
      this.publishStats();
      c.iv.length = 0;
      c.skip = 6;
    } else {
      c.on = false;
      if (median > 21) this.slow = true;
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.destroyed || this.failed || !this.gl || this.gl.isContextLost()) return;
    const running = this.running();
    const moving = this.progress !== this.target;
    const min = this.minInterval(moving);
    if (running && this.last && now - this.last < min - 4) {
      this.raf = requestAnimationFrame(this.frame); // not yet: skip this display frame
      return;
    }
    if (running && this.last) {
      const iv = now - this.last;
      if (min === 0) {
        this.calibrate(iv, now);
        if (!this.cal.on) {
          this.ema += (iv - this.ema) * 0.05;
          if (this.ema > 26 && ++this.slowFrames > 60) this.slow = true;
        }
      }
      const ivs = this.intervals;
      ivs.push(iv);
      if (ivs.length > 16) ivs.shift();
      if (ivs.length >= 10 && now - this.wokeAt > 1200 && !this.cal.on) {
        const median = [...ivs].sort((a, b) => a - b)[ivs.length >> 1];
        if (median > 70) this.stalled = true;
      }
    }
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.ensureModels();
    const s = this.update(dt);
    this.draw(s);
    this.drawn = true;
    const label = s.settled ? (s.T === 0 ? s.A.model : s.B.model) : `${s.A.model}→${s.B.model}`;
    if (label !== this.stateLabel) this.canvas.dataset.state = this.stateLabel = label;
    // Keep going while something moves; otherwise one frame per request (reduced motion, a
    // hidden tab, offscreen, or settled on a state with no ink).
    const ink = (s.A.ink ?? 1) + ((s.B.ink ?? 1) - (s.A.ink ?? 1)) * s.T;
    const alive =
      this.progress !== this.target ||
      this.cal.on ||
      this.hov.s > 0.002 ||
      (ink > 0.002 && !this.software && (s.onTerrain || s.modelShown));
    if (running && alive) this.raf = requestAnimationFrame(this.frame);
  };
}
