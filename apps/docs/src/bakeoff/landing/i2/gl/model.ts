/**
 * The bit's meshes, built once per page load in a worker and shared by every
 * mount (StrictMode mounts twice; a context restore re-uploads the same data).
 */

import { buildBit, type BitModel } from "./bit";

let pending: Promise<BitModel> | null = null;

export function loadModel(): Promise<BitModel> {
  if (pending) return pending;
  pending = new Promise<BitModel>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
    } catch {
      // No module workers: build here, after the first paint at least.
      setTimeout(() => resolve(buildBit()), 0);
      return;
    }
    worker.onmessage = (e: MessageEvent<BitModel>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(buildBit());
    };
    worker.postMessage("build");
  });
  return pending;
}
