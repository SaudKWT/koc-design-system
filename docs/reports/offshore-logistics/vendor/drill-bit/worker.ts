// Builds the fi3 bit's meshes off the main thread, as fi3's build.worker.ts
// does. Bundled to a string and started from a Blob URL, because a single
// HTML file has no second file to point a Worker at.
import { buildBit } from "@fi3gl/bit";

const scope = self as unknown as Worker;
scope.onmessage = () => {
  const model = buildBit();
  const buffers = new Set<ArrayBuffer>();
  for (const m of [model.shank, model.crown, model.cutter, model.nozzle])
    for (const a of [m.pos, m.nrm, m.pnl, m.mat, m.idx]) buffers.add(a.buffer as ArrayBuffer);
  for (const c of model.cutters) buffers.add(c.m.buffer as ArrayBuffer);
  for (const n of model.nozzles) buffers.add(n.m.buffer as ArrayBuffer);
  scope.postMessage(model, [...buffers]);
};
