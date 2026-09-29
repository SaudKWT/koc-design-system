import type { Platform } from "../data";

/**
 * The console's short platform chip. A display mapping only — derived from `platform`, never
 * stored — so the shared data keeps one source of truth for where a dashboard lives.
 */
export const PLATFORM_CODE: Record<Platform, string> = {
  "power-bi": "PBI",
  sharepoint: "SP",
  "web-app": "APP",
};
