/**
 * Builds chapters off the main thread. The SDF sculpts (camels, people) take
 * hundreds of milliseconds each; on the main thread that is a frozen page.
 *
 * In: { chapter }. Out: { chapter, items }, every buffer transferred, not copied.
 */

import { BUILDERS } from "./scene";

self.onmessage = (e: MessageEvent<{ chapter: number }>) => {
  const { chapter } = e.data;
  const items = BUILDERS[chapter]();
  const transfer: ArrayBuffer[] = [];
  // Copy before transferring: shared unit meshes (angle, rod, pipe) are module
  // constants here, and a transferred buffer is detached for every later build.
  const out = items.map((it) => {
    const vertices = it.mesh.vertices.slice();
    const indices = it.mesh.indices.slice();
    const instances = it.instances?.slice();
    transfer.push(vertices.buffer, indices.buffer);
    if (instances) transfer.push(instances.buffer);
    const { model: _model, ...rest } = it;
    void _model;
    return { ...rest, mesh: { vertices, indices }, instances };
  });
  self.postMessage({ chapter, items: out }, { transfer });
};
