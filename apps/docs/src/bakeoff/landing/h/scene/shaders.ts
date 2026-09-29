/**
 * GLSL ES 3.00. Colours arrive as uniforms read from KOC tokens (tokens.ts);
 * the only literals here are light intensities and pattern geometry.
 *
 * Output is premultiplied sRGB over a transparent canvas, so the page's own
 * background token shows through wherever nothing is drawn.
 */

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
`;

const SRGB = /* glsl */ `
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

/** Instanced (or constant-instance) meshes: the rig, pads, trees, the bit. */
export const CLAY_VS = /* glsl */ `${HEAD}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 3) in vec4 a_m0;
layout(location = 4) in vec4 a_m1;
layout(location = 5) in vec4 a_m2;
layout(location = 6) in vec4 a_m3;
layout(location = 7) in vec4 a_col;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform mat4 u_light;
out vec3 v_wpos;
out vec3 v_nrm;
out vec4 v_col;
out vec4 v_lpos;
void main() {
  mat4 M = u_model * mat4(a_m0, a_m1, a_m2, a_m3);
  vec4 wp = M * vec4(a_pos, 1.0);
  mat3 m3 = mat3(M);
  vec3 s2 = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  v_nrm = normalize(m3 * (a_nrm / max(s2, vec3(1e-8))));
  v_wpos = wp.xyz;
  v_col = a_col;
  v_lpos = u_light * wp;
  gl_Position = u_viewProj * wp;
}
`;

export const CLAY_FS = /* glsl */ `${HEAD}
${SRGB}
in vec3 v_wpos;
in vec3 v_nrm;
in vec4 v_col;
in vec4 v_lpos;
uniform vec3 u_key;       // direction TO the key light
uniform vec3 u_fill;
uniform vec3 u_view;      // direction TO the camera
uniform vec3 u_amb;       // x: ground, y: sky, z: key strength
uniform float u_shadowOn;
uniform float u_groundY;  // for the contact-darkening term
uniform float u_alpha;
uniform highp sampler2DShadow u_shadow;
uniform float u_texel;
out vec4 o;

float shadowAt(vec4 lp, float ndl) {
  if (u_shadowOn < 0.5) return 1.0;
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = mix(0.0022, 0.0006, ndl);
  float s = 0.0;
  // 4×4 taps of hardware 2×2 PCF: a soft, stable penumbra.
  for (int y = -2; y < 2; y++)
    for (int x = -2; x < 2; x++)
      s += texture(u_shadow, vec3(p.xy + (vec2(x, y) + 0.5) * u_texel * 1.25, p.z - bias));
  return s / 16.0;
}

void main() {
  vec3 n = normalize(v_nrm);
  if (!gl_FrontFacing) n = -n;
  float ndl = max(dot(n, u_key), 0.0);
  float sh = shadowAt(v_lpos, ndl);
  float hemi = 0.5 + 0.5 * n.y;
  float amb = mix(u_amb.x, u_amb.y, hemi);
  float contact = mix(0.72, 1.0, smoothstep(0.0, 9.0, v_wpos.y - u_groundY));
  float fill = max(dot(n, u_fill), 0.0) * 0.22;
  float rim = pow(1.0 - max(dot(n, u_view), 0.0), 3.0) * 0.10;
  vec3 c = v_col.rgb * (amb * contact + u_amb.z * ndl * sh + fill) + rim;
  float a = v_col.a * u_alpha;
  o = vec4(toSRGB(c) * a, a);
}
`;

/** Depth-only pass for the shadow map. */
export const DEPTH_FS = /* glsl */ `${HEAD}
out vec4 o;
void main() { o = vec4(1.0); }
`;

/**
 * The earth block. Geology is a solid texture: every fragment works out which
 * formation it is in from its own position, the fold and the table of tops, so
 * any cut through the block — side, section face or depth slice — is correct
 * without per-face bookkeeping.
 */
export const EARTH_VS = /* glsl */ `${HEAD}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in float a_aux;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
out vec3 v_geo;
out vec3 v_nrm;
flat out float v_face;
void main() {
  v_geo = a_pos;
  v_nrm = a_nrm;
  v_face = a_aux;
  gl_Position = u_viewProj * vec4(a_pos + u_offset, 1.0);
}
`;

export const NF = 18;

export const EARTH_FS = /* glsl */ `${HEAD}
${SRGB}
#define NF ${NF}
in vec3 v_geo;
in vec3 v_nrm;
flat in float v_face;
uniform float u_tops[NF];
uniform vec3 u_cols[NF];
uniform float u_lith[NF];
uniform float u_owc[NF];
uniform vec4 u_dome;       // cx, cz, sx, sz
uniform vec2 u_fold;       // amplitude, growth depth
uniform vec3 u_ink;
uniform vec3 u_oil;
uniform vec3 u_water;
uniform vec3 u_sand;
uniform vec3 u_key;
uniform vec3 u_fill;
uniform vec3 u_amb;
uniform float u_alpha;
uniform float u_inkAmt;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }

float uplift(vec3 p) {
  vec2 d = (p.xz - u_dome.xy) / u_dome.zw;
  float g = exp(-0.5 * dot(d, d));
  return u_fold.x * g * clamp(-p.y / u_fold.y, 0.0, 1.0);
}

// Anti-aliased stroke: d = distance to the stroke centre in ft, fw = ft per px.
float stroke(float d, float fw, float halfPx) {
  return 1.0 - smoothstep(halfPx - 0.6, halfPx + 0.6, abs(d) / fw);
}

// Lithology fills, drawn to the conventions a geologist reads on a section:
// sand = scattered circles, sandstone = stipple, shale = broken dashes,
// limestone = brickwork, dolomite = slanted brickwork, anhydrite = hatching.
float pattern(float lith, vec2 uv, float fw) {
  if (lith < 0.5) {                       // sand & gravel
    vec2 cell = floor(uv / 150.0);
    vec2 c = (cell + 0.25 + 0.5 * hash2(cell)) * 150.0;
    float r = 14.0 + 10.0 * hash(cell + 3.1);
    return stroke(length(uv - c) - r, fw, 0.45);
  }
  if (lith < 1.5) {                       // sandstone
    vec2 cell = floor(uv / 70.0);
    vec2 c = (cell + 0.2 + 0.6 * hash2(cell)) * 70.0;
    return 1.0 - smoothstep(0.55, 1.35, length(uv - c) / fw);
  }
  if (lith < 2.5) {                       // shale
    float row = floor(uv.y / 64.0);
    float dy = uv.y - (row + 0.5) * 64.0;
    float x = uv.x + row * 47.0;
    float dash = step(fract(x / 150.0), 0.52);
    return stroke(dy, fw, 0.45) * dash;
  }
  if (lith < 4.5) {                       // limestone (3) / dolomite (4) brickwork
    float row = floor(uv.y / 96.0);
    float dy = uv.y - row * 96.0;
    float slant = lith > 3.5 ? (dy / 96.0) * 60.0 : 0.0;
    float x = uv.x + mod(row, 2.0) * 110.0 - slant;
    float dx = x - floor(x / 220.0 + 0.5) * 220.0;
    float h = stroke(min(dy, 96.0 - dy), fw, 0.45);
    float v = stroke(dx, fw, 0.45);
    return max(h, v);
  }
  // anhydrite
  float d = (uv.x + uv.y) * 0.70710678;
  float k = d - floor(d / 84.0 + 0.5) * 84.0;
  return stroke(k, fw, 0.4);
}

void main() {
  vec3 p = v_geo;
  vec3 n = normalize(v_nrm);
  float depth = -p.y;

  // Plane coordinates for the pattern, by which way the face looks.
  vec2 uv = abs(n.y) > 0.5 ? p.xz : (abs(n.x) > 0.5 ? vec2(p.z, p.y) : vec2(p.x, p.y));
  float fw = max(length(fwidth(uv)) * 0.70710678, 1e-3);

  vec3 col;
  float ink = 0.0;
  if (n.y > 0.5 && depth < 1.0) {
    // The ground surface: desert, with the 1,000 ft survey grid.
    float g = hash(floor(p.xz / 18.0));
    col = u_sand * (0.965 + 0.05 * g);
    vec2 gp = p.xz / 1000.0;
    vec2 gd = abs(gp - floor(gp + 0.5)) * 1000.0;
    ink = max(stroke(gd.x, fw, 0.4), stroke(gd.y, fw, 0.4)) * 0.28;
  } else {
    float s = depth + uplift(p);
    int i = 0;
    for (int k = 0; k < NF; k++) if (s >= u_tops[k]) i = k;
    col = u_cols[i];
    // Contacts between formations: the fine line a section is drawn with.
    float dTop = s - u_tops[i];
    float dNext = i < NF - 1 ? u_tops[i + 1] - s : 1e9;
    float fws = max(fwidth(s), 1e-3);
    float contact = 1.0 - smoothstep(0.35, 1.25, min(dTop, dNext) / fws);
    // Oil above a flat oil–water contact, water below it.
    float owc = u_owc[i];
    if (owc > 0.0) {
      float fwd = max(fwidth(depth), 1e-3);
      if (depth < owc) col = mix(col, u_oil, 0.7);
      else col = mix(col, u_water, 0.22);
      float owcLine = 1.0 - smoothstep(0.35, 1.2, abs(depth - owc) / fwd);
      col = mix(col, u_oil, owcLine * 0.9);
    }
    float pat = pattern(u_lith[i], uv, fw);
    ink = max(pat * u_inkAmt, contact * 0.6);
  }
  col = mix(col, u_ink, ink);

  // Clay light: hemisphere ambient, a key and a fill. Faces of a block are flat,
  // so this is what separates top, section and flank at a glance.
  float hemi = 0.5 + 0.5 * n.y;
  float amb = mix(u_amb.x, u_amb.y, hemi);
  float l = amb + u_amb.z * max(dot(n, u_key), 0.0) + 0.16 * max(dot(n, u_fill), 0.0);
  vec3 c = col * l;
  o = vec4(toSRGB(c) * u_alpha, u_alpha);
}
`;

/** Well bores: drilled (solid), planned (dashed ghost), and the x-ray pass. */
export const WELL_VS = /* glsl */ `${HEAD}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in float a_aux;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
out vec3 v_nrm;
out float v_md;
out float v_depth;
void main() {
  v_nrm = a_nrm;
  v_md = a_aux;
  v_depth = -a_pos.y;
  gl_Position = u_viewProj * vec4(a_pos + u_offset, 1.0);
}
`;

export const WELL_FS = /* glsl */ `${HEAD}
${SRGB}
in vec3 v_nrm;
in float v_md;
in float v_depth;
uniform vec3 u_color;
uniform vec3 u_plan;
uniform float u_drilled;   // MD drilled so far; beyond it the plan shows dashed
uniform float u_xray;      // 1 = hidden-line pass
uniform vec2 u_fade;       // depth where the bore starts / finishes fading out
uniform vec3 u_key;
uniform vec3 u_view;
uniform float u_alpha;
out vec4 o;
void main() {
  float fade = 1.0 - smoothstep(u_fade.x, u_fade.y, v_depth);
  if (u_xray > 0.5) {
    // Hidden line convention: behind the cut face, the bore shows dashed.
    if (fract(v_md / 140.0) > 0.5) discard;
    float a = 0.55 * fade * u_alpha;
    o = vec4(toSRGB(u_color) * a, a);
    return;
  }
  vec3 n = normalize(v_nrm);
  vec3 base = u_color;
  float a = fade * u_alpha;
  if (v_md > u_drilled) {
    if (fract(v_md / 170.0) > 0.56) discard;
    base = u_plan;
    a *= 0.9;
  }
  float l = 0.62 + 0.38 * max(dot(n, u_key), 0.0);
  float rim = pow(1.0 - max(dot(n, u_view), 0.0), 2.0) * 0.18;
  vec3 c = base * l + rim;
  o = vec4(toSRGB(c) * a, a);
}
`;

/** Thick, screen-constant lines (block edges). Ortho only: w stays 1. */
export const LINE_VS = /* glsl */ `${HEAD}
layout(location = 0) in vec3 a_a;
layout(location = 1) in vec3 a_b;
layout(location = 2) in vec2 a_side;
uniform mat4 u_viewProj;
uniform vec2 u_viewport;   // device px
uniform float u_width;     // device px
uniform vec3 u_offset;
void main() {
  vec4 pa = u_viewProj * vec4(a_a + u_offset, 1.0);
  vec4 pb = u_viewProj * vec4(a_b + u_offset, 1.0);
  vec2 sa = pa.xy * u_viewport;
  vec2 sb = pb.xy * u_viewport;
  vec2 dir = normalize(sb - sa + vec2(1e-6));
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 p = mix(pa, pb, a_side.x);
  p.xy += nrm * a_side.y * u_width / u_viewport;
  p.z -= 0.0004;
  gl_Position = p;
}
`;

export const LINE_FS = /* glsl */ `${HEAD}
${SRGB}
uniform vec3 u_color;
uniform float u_alpha;
out vec4 o;
void main() { o = vec4(toSRGB(u_color) * u_alpha, u_alpha); }
`;
