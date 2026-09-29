/**
 * The hero scene: a sectioned block of a Kuwaiti anticline, the pads on its
 * surface, a land rig on location at true scale, and five wells.
 *
 * Scale is 1:1 everywhere, horizontal and vertical. Two things are drawn larger
 * than life and the page says so: the bores (a hole is a hundredth of a pixel
 * at this scale) and the pad markers in the HTML overlay. The rig itself is at
 * true size on its pad — it is ~11 px tall here, which is the honest answer to
 * "how big is a rig against a reservoir"; its detail lives in the asset card.
 */

import { box, cube, cylinder, merge, sphere, tube, type MeshData } from "./geometry";
import {
  constantInstance,
  createContext,
  draw,
  drawLines,
  program,
  setInstances,
  shadowMap,
  uploadLines,
  uploadMesh,
  type Lines,
  type Mesh,
  type Program,
  type ShadowMap,
} from "./gl";
import { DEG, lookAt, multiply, ortho, transformPoint, trs, v3, type Mat4, type Vec3 } from "./math";
import { rigDynamic, rigStatic, type Part, type RigMaterial } from "./rig";
import {
  CLAY_FS,
  CLAY_VS,
  EARTH_FS,
  EARTH_VS,
  LINE_FS,
  LINE_VS,
  NF,
  WELL_FS,
  WELL_VS,
} from "./shaders";
import { BLOCK, DOME, FORMATIONS, LITH_CODE, owcFor } from "./strata";
import { mix, type Palette, type RGB } from "./tokens";
import { ACTIVE_SURVEY, SURVEYS } from "./surveys";
import { BORE_DRAW_RADIUS, PADS, type Survey } from "./wells";

export interface BlockState {
  /** Camera yaw, radians (from +x toward +z). */
  yaw: number;
  /** 0 = block whole, 1 = the section piece fully lifted out. */
  cut: number;
  /** Fraction of the active well drilled, 0..1. */
  drilled: number;
  /** Show bores that lie inside the solid, as dashed hidden lines. */
  xray: boolean;
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PITCH = 27 * DEG;
export const YAW_BASE = 57 * DEG;
export const YAW_SWING = 9 * DEG;
const TARGET: Vec3 = [0, -4200, 0];
const EYE_DIST = 60000;

const { x0, x1, z0, z1, depth: H, notchX: nx, notchZ: nz, cutDepth: cut } = BLOCK;

const ACTIVE = ACTIVE_SURVEY;
export const RIG_AT: Vec3 = [ACTIVE.plan.surface[0], 0, ACTIVE.plan.surface[1]];

/** Points the fit must keep in frame, whatever the yaw. */
const FIT_POINTS: Vec3[] = [
  [x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1],
  [x0, -H, z0], [x1, -H, z0], [x0, -H, z1], [x1, -H, z1],
  ...SURVEYS.filter((s) => s.plan.status === "deep").map((s) => s.points[s.points.length - 1]),
];

function edges(): [Vec3, Vec3][] {
  const s: [Vec3, Vec3][] = [];
  const poly = (pts: Vec3[], close = true) => {
    for (let i = 0; i < pts.length - (close ? 0 : 1); i++) s.push([pts[i], pts[(i + 1) % pts.length]]);
  };
  // Surface outline — the L the cut leaves.
  poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, nz], [nx, 0, nz], [nx, 0, z1], [x0, 0, z1]]);
  // The depth slice the cut stops at, and the base.
  poly([[nx, -cut, nz], [x1, -cut, nz], [x1, -cut, z1], [nx, -cut, z1]]);
  poly([[x0, -H, z0], [x1, -H, z0], [x1, -H, z1], [x0, -H, z1]]);
  s.push([[x0, -cut, z1], [nx, -cut, z1]]);
  // Verticals.
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1]] as const) s.push([[x, 0, z], [x, -H, z]]);
  for (const [x, z] of [[x1, nz], [nx, nz], [nx, z1]] as const) s.push([[x, 0, z], [x, -cut, z]]);
  s.push([[x1, -cut, z1], [x1, -H, z1]]);
  return s;
}

function pieceEdges(): [Vec3, Vec3][] {
  const s: [Vec3, Vec3][] = [];
  const a: Vec3[] = [[nx, 0, nz], [x1, 0, nz], [x1, 0, z1], [nx, 0, z1]];
  for (let i = 0; i < 4; i++) {
    s.push([a[i], a[(i + 1) % 4]]);
    const b = a[i];
    const c = a[(i + 1) % 4];
    s.push([[b[0], -cut, b[2]], [c[0], -cut, c[2]]]);
    s.push([b, [b[0], -cut, b[2]]]);
  }
  return s;
}

function roads(): MeshData {
  const w = 22;
  const hgt = 2.5;
  const seg = (ax: number, az: number, bx: number, bz: number) => {
    // Axis-aligned road pieces only — desert tracks here run on the grid.
    const xa = Math.min(ax, bx) - w, xb = Math.max(ax, bx) + w;
    const za = Math.min(az, bz) - w, zb = Math.max(az, bz) + w;
    return box([xa, 0, za], [xb, hgt, zb]);
  };
  return merge([
    seg(x0, -1900, -1000, -1900), // trunk road in from the west edge
    seg(-1000, -1900, -1000, -330), // to pad A
    seg(-3500, -1900, -3500, -2320), // spur to pad D
    seg(-1660, -1900, -1660, 420), // to pad B
    seg(-1660, 770, -1660, 2820), // on to pad C
    seg(-1660, 3170, -1660, z1), // and out the south edge
  ]);
}

export class BlockRenderer {
  readonly gl: WebGL2RenderingContext;
  private clay!: Program;
  private earth!: Program;
  private well!: Program;
  private line!: Program;
  private solid!: Mesh;
  private piece!: Mesh;
  private cubes!: Mesh;
  private cyls!: Mesh;
  private bit!: Mesh;
  private wells: { s: Survey; mesh: Mesh }[] = [];
  private blockEdges!: Lines;
  private pieceLines!: Lines;
  private pal!: Palette;
  private colors: Record<string, RGB> = {};
  private fColors: Float32Array = new Float32Array(NF * 3);
  private readonly tops = FORMATIONS.map((f) => f.top);
  private readonly liths = FORMATIONS.map((f) => LITH_CODE[f.lith]);
  private readonly owcs = FORMATIONS.map((f) => owcFor(f));
  private readonly rigParts = [...rigStatic().filter((p) => p.mat !== "pad"), ...rigDynamic(60)];

  private viewProj: Mat4 = new Float32Array(16);
  private cssW = 1;
  private cssH = 1;
  private scale = 1;
  private bounds = { l: 0, r: 1, b: 0, t: 1 };
  /** The static frame, CSS px, that the block sways inside. */
  frameRect: Frame = { x: 0, y: 0, w: 1, h: 1 };

  constructor(canvas: HTMLCanvasElement) {
    const gl = createContext(canvas, {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("no hardware webgl2");
    this.gl = gl;
    this.init();
  }

  private init() {
    const gl = this.gl;
    this.clay = program(gl, CLAY_VS, CLAY_FS);
    this.earth = program(gl, EARTH_VS, EARTH_FS);
    this.well = program(gl, WELL_VS, WELL_FS);
    this.line = program(gl, LINE_VS, LINE_FS);

    this.solid = uploadMesh(
      gl,
      merge([
        box([x0, -H, z0], [x1, -cut, z1]),
        box([x0, -cut, z0], [nx, 0, z1]),
        box([nx, -cut, z0], [x1, 0, nz]),
      ]),
    );
    this.piece = uploadMesh(gl, box([nx, -cut, nz], [x1, 0, z1]));
    this.cubes = uploadMesh(gl, cube(), true);
    this.cyls = uploadMesh(gl, cylinder(24), true);
    this.bit = uploadMesh(gl, sphere(24, 48));
    this.wells = SURVEYS.map((s) => ({
      s,
      mesh: uploadMesh(gl, tube(s.points, BORE_DRAW_RADIUS, 20, s.md)),
    }));
    this.blockEdges = uploadLines(gl, edges());
    this.pieceLines = uploadLines(gl, pieceEdges());
    this.roadMesh = uploadMesh(gl, roads());
    // The clay program declares a shadow sampler; this scene casts no shadows
    // (the rig is 11 px tall), but the sampler still needs a depth texture bound.
    this.noShadow = shadowMap(gl, 4);
  }

  private noShadow!: ShadowMap;

  private roadMesh!: Mesh;

  setPalette(p: Palette) {
    this.pal = p;
    const bg = p.background;
    const fg = p.foreground;
    const clay = p.dark ? mix(p.card, fg, 0.2) : mix(p.card, bg, 0.25);
    this.colors = {
      clay,
      ink: p.dark ? mix(fg, bg, 0.25) : mix(fg, bg, 0.12),
      sand: p.dark ? mix(mix(p.card, fg, 0.1), p["chart-2"], 0.09) : mix(p.card, p["chart-2"], 0.1),
      pad: p.dark ? mix(p.card, fg, 0.34) : mix(mix(p.card, fg, 0.2), p["chart-2"], 0.1),
      road: p.dark ? mix(p.card, fg, 0.26) : mix(p.card, fg, 0.16),
      active: p.primary,
      plan: mix(p.primary, bg, 0.35),
      done: p.dark ? mix(fg, bg, 0.2) : mix(fg, bg, 0.18),
      oil: p["chart-2"],
      water: p["chart-5"],
      steel: mix(clay, fg, 0.3),
      dark: mix(clay, fg, 0.6),
    };
    this.fColors = this.formationColors();
  }

  /** Per-formation colours: a pale clay base, tinted by lithology from chart tokens. */
  private formationColors(): Float32Array {
    const p = this.pal;
    const base = p.dark ? mix(p.card, p.foreground, 0.06) : mix(p.card, p.background, 0.5);
    const tint: Record<string, [RGB, number]> = {
      sand: [p["chart-2"], p.dark ? 0.16 : 0.2],
      sandstone: [p["chart-2"], p.dark ? 0.1 : 0.12],
      shale: [p.foreground, p.dark ? 0.1 : 0.13],
      limestone: [p["chart-5"], p.dark ? 0.12 : 0.13],
      dolomite: [p["chart-4"], p.dark ? 0.1 : 0.1],
      anhydrite: [p["chart-1"], p.dark ? 0.06 : 0.05],
    };
    const out = new Float32Array(NF * 3);
    FORMATIONS.forEach((f, i) => {
      const [c, k] = tint[f.lith];
      // Alternate a whisker of lightness so neighbours of one lithology still separate.
      const lift = i % 2 === 0 ? 0 : p.dark ? 0.035 : 0.025;
      out.set(mix(mix(base, c, k), p.foreground, lift), i * 3);
    });
    return out;
  }

  /**
   * Fit the block into `frame` (CSS px within the canvas) for every yaw in the
   * swing, so the dashed selection frame the page draws never has to move.
   */
  layout(cssW: number, cssH: number, frame: Frame) {
    this.cssW = cssW;
    this.cssH = cssH;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k <= 12; k++) {
      const yaw = YAW_BASE - YAW_SWING + (2 * YAW_SWING * k) / 12;
      const view = this.view(yaw);
      for (const p of FIT_POINTS) {
        const v = transformPoint(view, p);
        minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
        minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      }
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const s = Math.min(frame.w / bw, frame.h / bh);
    this.scale = s;
    const padX = (frame.w - bw * s) / 2;
    const padY = (frame.h - bh * s) / 2;
    const l = minX - (frame.x + padX) / s;
    const t = maxY + (frame.y + padY) / s;
    this.bounds = { l, r: l + cssW / s, t, b: t - cssH / s };
    this.frameRect = { x: frame.x + padX, y: frame.y + padY, w: bw * s, h: bh * s };
  }

  /** CSS px per foot, at the current fit. */
  get pxPerFt() {
    return this.scale;
  }

  private view(yaw: number): Mat4 {
    const d: Vec3 = [Math.cos(PITCH) * Math.cos(yaw), Math.sin(PITCH), Math.cos(PITCH) * Math.sin(yaw)];
    return lookAt(v3.add(TARGET, v3.scale(d, EYE_DIST)), TARGET, [0, 1, 0]);
  }

  /** World point → CSS px in the canvas box, for the current frame. */
  project(p: Vec3): [number, number] {
    const c = transformPoint(this.viewProj, p);
    return [(c[0] * 0.5 + 0.5) * this.cssW, (0.5 - c[1] * 0.5) * this.cssH];
  }

  render(st: BlockState) {
    const gl = this.gl;
    const { l, r, b, t } = this.bounds;
    const view = this.view(st.yaw);
    this.viewProj = multiply(ortho(l, r, b, t, 1000, EYE_DIST * 2), view);
    const eyeDir = v3.norm([
      Math.cos(PITCH) * Math.cos(st.yaw),
      Math.sin(PITCH),
      Math.cos(PITCH) * Math.sin(st.yaw),
    ]);
    const key = v3.norm([-0.35, 1, 0.72]);
    const fill = v3.norm([1, 0.25, -0.2]);
    const dark = this.pal.dark;
    const amb: Vec3 = dark ? [0.5, 0.62, 0.42] : [0.6, 0.7, 0.36];

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // ── Earth ───────────────────────────────────────────────────────────
    const pieceOn = st.cut < 0.999;
    const pieceOpaque = st.cut < 0.001;
    gl.useProgram(this.earth.prog);
    const u = this.earth.u;
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.uniform1fv(u.u_tops, this.tops);
    gl.uniform3fv(u.u_cols, this.fColors);
    gl.uniform1fv(u.u_lith, this.liths);
    gl.uniform1fv(u.u_owc, this.owcs);
    gl.uniform4f(u.u_dome, DOME.cx, DOME.cz, DOME.sx, DOME.sz);
    gl.uniform2f(u.u_fold, DOME.amplitude, DOME.growth);
    gl.uniform3fv(u.u_ink, this.colors.ink);
    gl.uniform3fv(u.u_oil, this.colors.oil);
    gl.uniform3fv(u.u_water, this.colors.water);
    gl.uniform3fv(u.u_sand, this.colors.sand);
    gl.uniform3fv(u.u_key, key);
    gl.uniform3fv(u.u_fill, fill);
    gl.uniform3fv(u.u_amb, amb);
    gl.uniform1f(u.u_inkAmt, dark ? 0.2 : 0.17);
    gl.uniform1f(u.u_alpha, 1);
    gl.uniform3f(u.u_offset, 0, 0, 0);
    // Faces sit a hair behind the edge lines and the bores that lie on them.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 2);
    draw(gl, this.solid);
    if (pieceOpaque) draw(gl, this.piece);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // ── Surface kit: pads, roads, the rig at true scale ─────────────────
    this.drawSurface(key, fill, eyeDir, amb);

    // ── Bores ───────────────────────────────────────────────────────────
    gl.useProgram(this.well.prog);
    const w = this.well.u;
    gl.uniformMatrix4fv(w.u_viewProj, false, this.viewProj);
    gl.uniform3fv(w.u_key, key);
    gl.uniform3fv(w.u_view, eyeDir);
    gl.uniform3f(w.u_offset, 0, 0, 0);
    gl.uniform1f(w.u_alpha, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (st.xray) {
      gl.depthFunc(gl.GREATER);
      gl.depthMask(false);
      gl.uniform1f(w.u_xray, 1);
      for (const { s, mesh } of this.wells) {
        this.wellUniforms(s, st);
        gl.uniform3fv(w.u_color, this.colors.ink);
        draw(gl, mesh);
      }
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
    }
    gl.uniform1f(w.u_xray, 0);
    for (const { s, mesh } of this.wells) {
      this.wellUniforms(s, st);
      draw(gl, mesh);
    }

    // The bit, at the head of the drilled section.
    const bitAt = this.bitPosition(st.drilled);
    gl.useProgram(this.clay.prog);
    gl.uniformMatrix4fv(this.clay.u.u_model, false, trs(bitAt, 150));
    constantInstance(gl, this.colors.active, 1);
    gl.uniform1f(this.clay.u.u_alpha, 1);
    draw(gl, this.bit);

    // ── Edges ───────────────────────────────────────────────────────────
    gl.useProgram(this.line.prog);
    const lu = this.line.u;
    gl.uniformMatrix4fv(lu.u_viewProj, false, this.viewProj);
    gl.uniform2f(lu.u_viewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const dpr = gl.drawingBufferWidth / this.cssW;
    gl.uniform1f(lu.u_width, 1.1 * dpr);
    gl.uniform3fv(lu.u_color, this.colors.ink);
    gl.uniform1f(lu.u_alpha, dark ? 0.5 : 0.42);
    gl.uniform3f(lu.u_offset, 0, 0, 0);
    drawLines(gl, this.blockEdges);
    if (pieceOpaque) drawLines(gl, this.pieceLines);

    // ── The lifted section piece, fading as it rises out ────────────────
    if (pieceOn && !pieceOpaque) {
      const e = st.cut;
      const off: Vec3 = [e * 1800, e * 5200, e * 2600];
      const a = Math.pow(1 - e, 1.6);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.depthMask(false);
      gl.useProgram(this.earth.prog);
      gl.uniform3fv(u.u_offset, off);
      gl.uniform1f(u.u_alpha, a);
      draw(gl, this.piece);
      gl.useProgram(this.line.prog);
      gl.uniform3fv(lu.u_offset, off);
      gl.uniform1f(lu.u_alpha, (dark ? 0.5 : 0.42) * a);
      drawLines(gl, this.pieceLines);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
    }
    gl.disable(gl.BLEND);
  }

  private wellUniforms(s: Survey, st: BlockState) {
    const gl = this.gl;
    const w = this.well.u;
    const drilling = s.plan.status === "drilling";
    gl.uniform3fv(w.u_color, drilling ? this.colors.active : this.colors.done);
    gl.uniform3fv(w.u_plan, this.colors.plan);
    gl.uniform1f(w.u_drilled, drilling ? s.tdMd * st.drilled : 1e9);
    if (s.plan.status === "deep") gl.uniform2f(w.u_fade, H + 400, s.tdTvd);
    else gl.uniform2f(w.u_fade, 1e8, 2e8);
  }

  /** World position of the bit for a drilled fraction of the active well. */
  bitPosition(frac: number): Vec3 {
    const pts = ACTIVE.points;
    const f = Math.min(1, Math.max(0, frac)) * (pts.length - 1);
    const i = Math.floor(f);
    return v3.lerp(pts[i], pts[Math.min(pts.length - 1, i + 1)], f - i);
  }

  private drawSurface(key: Vec3, fill: Vec3, eye: Vec3, amb: Vec3) {
    const gl = this.gl;
    const c = this.colors;
    gl.useProgram(this.clay.prog);
    const u = this.clay.u;
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.uniform3fv(u.u_key, key);
    gl.uniform3fv(u.u_fill, fill);
    gl.uniform3fv(u.u_view, eye);
    gl.uniform3fv(u.u_amb, amb);
    gl.uniform1f(u.u_shadowOn, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noShadow.tex);
    gl.uniform1i(u.u_shadow, 0);
    gl.uniform1f(u.u_groundY, -1e6);
    gl.uniform1f(u.u_alpha, 1);
    gl.uniformMatrix4fv(u.u_light, false, new Float32Array(16));
    gl.uniformMatrix4fv(u.u_model, false, trs([0, 0, 0]));

    // Roads.
    constantInstance(gl, c.road, 1);
    draw(gl, this.roadMesh);

    // Pads as instanced boxes.
    const padData = new Float32Array(PADS.length * 20);
    PADS.forEach((p, k) => {
      const m = new Float32Array(16);
      m[0] = p.x1 - p.x0; m[5] = 5; m[10] = p.z1 - p.z0; m[15] = 1;
      m[12] = (p.x0 + p.x1) / 2; m[13] = 2.5; m[14] = (p.z0 + p.z1) / 2;
      padData.set(m, k * 20);
      padData.set([...c.pad, 1], k * 20 + 16);
    });
    setInstances(gl, this.cubes, padData);
    draw(gl, this.cubes);

    // The rig, at true size, on pad A.
    gl.uniformMatrix4fv(u.u_model, false, trs(RIG_AT, 1, 0));
    this.drawParts(this.rigParts);
  }

  private drawParts(parts: Part[]) {
    const gl = this.gl;
    const col = (m: RigMaterial): RGB =>
      m === "accent" ? this.colors.active : m === "steel" ? this.colors.steel : m === "dark" ? this.colors.dark : this.colors.clay;
    for (const [mesh, kind] of [[this.cubes, "cube"], [this.cyls, "cyl"]] as const) {
      const list = parts.filter((p) => p.mesh === kind);
      const data = new Float32Array(list.length * 20);
      list.forEach((p, k) => {
        data.set(p.m, k * 20);
        data.set([...col(p.mat), 1], k * 20 + 16);
      });
      setInstances(gl, mesh, data);
      draw(gl, mesh);
    }
  }

  /**
   * Free the context only when the canvas has really left the page. Under
   * React StrictMode the effect is torn down and re-run on the SAME canvas, and
   * `getContext` would hand the re-run a context this call had just killed.
   */
  dispose() {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    if (!canvas.isConnected) this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
