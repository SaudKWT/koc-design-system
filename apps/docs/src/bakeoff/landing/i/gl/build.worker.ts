/**
 * Builds the bit's meshes off the main thread. ~265k unique vertices with
 * surface-derived normals is 350–450 ms of CPU on an M4 — a long task that
 * would freeze the page at load on the laptops KOC actually issues.
 */

import { buildBit } from "./bit";

const scope = self as unknown as Worker;

scope.onmessage = () => {
  const model = buildBit();
  const buffers = new Set<ArrayBuffer>();
  for (const m of [model.shank, model.crown, model.cutter, model.nozzle])
    for (const a of [m.pos, m.nrm, m.pnl, m.mat, m.idx]) buffers.add(a.buffer as ArrayBuffer);
  for (const c of model.cutters) buffers.add(c.m.buffer as ArrayBuffer);
  for (const n of model.nozzles) buffers.add(n.m.buffer as ArrayBuffer);
  // Transferred, not copied: ~10 MB moves in constant time.
  scope.postMessage(model, [...buffers]);
};
