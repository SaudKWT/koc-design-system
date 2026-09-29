/**
 * No WebGL2: the same model, drawn once as a 2D wireframe.
 *
 * Without a depth buffer there is no hidden-line removal, so this is an honest
 * wireframe rather than a technical drawing — but it is the real geometry at
 * the real proportions, projected by the same camera, not a picture of it.
 * Silhouettes of curved surfaces are still decided per edge, on the CPU.
 */

import { m4, type Vec3 } from "./math";
import { INST_STRIDE, PART, SEG_STRIDE } from "./scene";
import type { Model } from "./rig";
import { Renderer, type CameraSpec } from "./renderer";
import { css, type Palette } from "./palette";

export function drawFallback(
  ctx: CanvasRenderingContext2D,
  model: Model,
  cam: CameraSpec,
  w: number,
  h: number,
  quill: number,
  pal: Palette,
) {
  const { viewProj, viewDir } = Renderer.matrices(cam, w / h);
  const toPx = (p: Vec3): [number, number] => {
    const q = m4.point(viewProj, p);
    return [(q[0] * 0.5 + 0.5) * w, (1 - (q[1] * 0.5 + 0.5)) * h];
  };
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.strokeStyle = css(pal.foreground, pal.dark ? 0.32 : 0.38);
  ctx.beginPath();
  for (const b of model.batches) {
    const E = b.template.edges;
    for (let i = 0; i < b.count; i++) {
      const o = i * INST_STRIDE;
      const part = b.data[o + 16];
      if (part === PART.well) continue; // below grade: nothing hides it here, so leave it out
      const M = b.data.subarray(o, o + 16) as unknown as Float32Array;
      const moving = b.data[o + 18] > 0.5;
      const nm = m4.normalMatrix(M);
      const face = (x: number, y: number, z: number) =>
        (nm[0] * x + nm[1] * y + nm[2] * z) * viewDir[0] +
        (nm[3] * x + nm[4] * y + nm[5] * z) * viewDir[1] +
        (nm[6] * x + nm[7] * y + nm[8] * z) * viewDir[2];
      for (let e = 0; e < E.count; e++) {
        const d = E.data, k = e * 16;
        if (d[k + 3] > 0.5 && face(d[k + 8], d[k + 9], d[k + 10]) * face(d[k + 12], d[k + 13], d[k + 14]) >= 0) continue;
        const a = m4.point(M, [d[k], d[k + 1], d[k + 2]]);
        const c = m4.point(M, [d[k + 4], d[k + 5], d[k + 6]]);
        if (moving) {
          a[1] += quill;
          c[1] += quill;
        }
        const pa = toPx(a), pc = toPx(c);
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pc[0], pc[1]);
      }
    }
  }
  const S = model.segs;
  for (let k = 0; k < S.length; k += SEG_STRIDE) {
    if (S[k + 12] === PART.well || S[k + 3] > 0.5) continue;
    const mm = S[k + 13];
    const a: Vec3 = [S[k], S[k + 1] + (mm % 2 ? quill : 0), S[k + 2]];
    const b: Vec3 = [S[k + 4], S[k + 5] + (mm > 1.5 ? quill : 0), S[k + 6]];
    const pa = toPx(a), pb = toPx(b);
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
  }
  ctx.stroke();
}
