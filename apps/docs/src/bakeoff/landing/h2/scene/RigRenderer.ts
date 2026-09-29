/**
 * The asset card's model: the rig on location, at true proportions, on its
 * pad, turning slowly under a fixed key light with a real shadow map — the
 * clay-render look of Mineralsoft's structure cards, built from members.
 */

import { cube, cylinder, lathe, tube, type MeshData } from "./geometry";
import {
  constantInstance,
  createContext,
  draw,
  program,
  setInstances,
  shadowMap,
  updateMesh,
  uploadMesh,
  type Mesh,
  type Program,
  type ShadowMap,
} from "./gl";
import { DEG, lookAt, multiply, ortho, transformPoint, trs, v3, type Mat4, type Vec3 } from "./math";
import { BOP_PROFILE, RIG, TREE_PROFILE, kellyHose, ramBodies, rigDynamic, rigStatic, type Part, type RigMaterial } from "./rig";
import { CLAY_FS, CLAY_VS, DEPTH_FS } from "./shaders";
import { mix, type Palette, type RGB } from "./tokens";

const PITCH = 21 * DEG;
const YAW = -38 * DEG;
const HOSE_SAMPLES = 96;
const TREES: Vec3[] = [
  [-26, 0, 33],
  [-12, 0, 36],
];

/** Height of the top drive above the floor at time t (s): drill a stand, pick up the next. */
export function topDriveHeight(t: number): number {
  const cycle = 14;
  const u = (t % cycle) / cycle;
  const drill = 0.8;
  if (u < drill) return 96 - (u / drill) * 90; // drilling down a 90 ft stand
  const k = (u - drill) / (1 - drill);
  const e = k * k * (3 - 2 * k);
  return 6 + e * 90; // tripping the block back up to the board
}

export class RigRenderer {
  readonly gl: WebGL2RenderingContext;
  private clay!: Program;
  private depth!: Program;
  private cubes!: Mesh;
  private cyls!: Mesh;
  private bop!: Mesh;
  private tree!: Mesh;
  private hose!: Mesh;
  private shadow!: ShadowMap;
  private staticParts: Part[] = rigStatic().concat(ramBodies());
  private colors: Record<RigMaterial, RGB> = {} as Record<RigMaterial, RGB>;
  private dark = false;
  private proj: Mat4 = new Float32Array(16);
  private view: Mat4 = new Float32Array(16);
  private lightVP: Mat4 = new Float32Array(16);

  constructor(canvas: HTMLCanvasElement) {
    const gl = createContext(canvas, { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error("no hardware webgl2");
    this.gl = gl;
    this.clay = program(gl, CLAY_VS, CLAY_FS);
    this.depth = program(gl, CLAY_VS, DEPTH_FS);
    this.cubes = uploadMesh(gl, cube(), true);
    this.cyls = uploadMesh(gl, cylinder(40), true);
    this.bop = uploadMesh(gl, lathe(BOP_PROFILE, 160));
    this.tree = uploadMesh(gl, lathe(TREE_PROFILE, 128));
    this.hose = uploadMesh(gl, this.hoseMesh(60), false, true);
    // 1024² resolves the rig's shadow to ~0.3 ft over its pad, well past what a
    // 240 px card can show.
    this.shadow = shadowMap(gl, 1024);
    this.setupLight();
  }

  private hoseMesh(h: number): MeshData {
    return tube(kellyHose(h, HOSE_SAMPLES), 0.42, 14);
  }

  private setupLight() {
    const L = v3.norm([-0.55, 1, 0.42]);
    const c: Vec3 = [0, 60, 0];
    const lv = lookAt(v3.add(c, v3.scale(L, 600)), c, [0, 1, 0]);
    this.lightVP = multiply(ortho(-150, 150, -150, 150, 200, 1100), lv);
    this.keyDir = L;
  }
  private keyDir: Vec3 = [0, 1, 0];

  setPalette(p: Palette) {
    this.dark = p.dark;
    const clay = p.dark ? mix(p.card, p.foreground, 0.42) : mix(p.card, p.background, 0.55);
    this.colors = {
      clay,
      steel: mix(clay, p.foreground, p.dark ? 0.22 : 0.4),
      dark: mix(clay, p.foreground, 0.62),
      accent: p.primary,
      pad: p.dark ? mix(p.card, p.foreground, 0.16) : mix(mix(p.card, p.background, 0.7), p["chart-2"], 0.12),
    };
  }

  /** Fit the turning rig inside the canvas. */
  layout(cssW: number, cssH: number) {
    this.view = lookAt(
      [Math.cos(PITCH) * Math.cos(YAW) * 800, 72 + Math.sin(PITCH) * 800, Math.cos(PITCH) * Math.sin(YAW) * 800],
      [0, 72, 0],
      [0, 1, 0],
    );
    const R = Math.hypot(RIG.extent.x1, RIG.extent.z1) + 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      for (const y of [-1.2, RIG.extent.y1]) {
        const v = transformPoint(this.view, [Math.cos(a) * R, y, Math.sin(a) * R]);
        minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
        minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      }
    }
    // The mast is the subject: let the footprint's far corners crop a little on
    // wide sweeps rather than shrink the whole rig to fit them.
    const pad = 0.94;
    const bw = (maxX - minX) * pad;
    const bh = maxY - minY;
    const s = Math.min(cssW / bw, cssH / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const hw = cssW / s / 2;
    const hh = cssH / s / 2;
    this.proj = ortho(cx - hw, cx + hw, cy - hh, cy + hh, 1, 2000);
  }

  render(t: number, yaw: number) {
    const gl = this.gl;
    const h = topDriveHeight(t);
    const parts = this.staticParts.concat(rigDynamic(h));
    const model = trs([0, 0, 0], 1, yaw);
    updateMesh(gl, this.hose, this.hoseMesh(h));

    const col = (m: RigMaterial) => this.colors[m];
    const batches = (["cube", "cyl"] as const).map((kind) => {
      const list = parts.filter((p) => p.mesh === kind);
      const data = new Float32Array(list.length * 20);
      list.forEach((p, k) => {
        data.set(p.m, k * 20);
        data.set([...col(p.mat), 1], k * 20 + 16);
      });
      return data;
    });
    setInstances(gl, this.cubes, batches[0]);
    setInstances(gl, this.cyls, batches[1]);

    const drawAll = () => {
      draw(gl, this.cubes);
      draw(gl, this.cyls);
      constantInstance(gl, this.colors.steel, 1);
      draw(gl, this.bop);
      constantInstance(gl, this.colors.dark, 1);
      draw(gl, this.hose);
    };
    const drawTrees = (u: Program["u"]) => {
      constantInstance(gl, this.colors.accent, 1);
      for (const p of TREES) {
        gl.uniformMatrix4fv(u.u_model, false, multiply(model, trs(p, 1)));
        draw(gl, this.tree);
      }
      gl.uniformMatrix4fv(u.u_model, false, model);
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    // ── Shadow pass ─────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, this.shadow.size, this.shadow.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depth.prog);
    gl.uniformMatrix4fv(this.depth.u.u_viewProj, false, this.lightVP);
    gl.uniformMatrix4fv(this.depth.u.u_model, false, model);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    drawAll();
    drawTrees(this.depth.u);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ── Colour pass ─────────────────────────────────────────────────────
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.clay.prog);
    const u = this.clay.u;
    const vp = multiply(this.proj, this.view);
    gl.uniformMatrix4fv(u.u_viewProj, false, vp);
    gl.uniformMatrix4fv(u.u_model, false, model);
    gl.uniformMatrix4fv(u.u_light, false, this.lightVP);
    gl.uniform3fv(u.u_key, this.keyDir);
    gl.uniform3fv(u.u_fill, v3.norm([0.8, 0.3, -0.5]));
    gl.uniform3fv(u.u_view, v3.norm([Math.cos(PITCH) * Math.cos(YAW), Math.sin(PITCH), Math.cos(PITCH) * Math.sin(YAW)]));
    gl.uniform3fv(u.u_amb, this.dark ? [0.4, 0.6, 0.52] : [0.38, 0.6, 0.55]);
    gl.uniform1f(u.u_shadowOn, 1);
    gl.uniform1f(u.u_groundY, 0);
    gl.uniform1f(u.u_alpha, 1);
    gl.uniform1f(u.u_texel, 1 / this.shadow.size);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
    gl.uniform1i(u.u_shadow, 0);
    drawAll();
    drawTrees(u);
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
