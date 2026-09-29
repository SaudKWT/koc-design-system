/**
 * Build config for the standalone landing comparison (see src/landing-main.tsx).
 *
 * Reuses the docs app's config for aliases and plugins, then narrows it: one
 * entry, its own output folder, and NO public directory, because public/r holds
 * the private `@koc` registry. The only public asset the pages use, the KOC
 * logo, is copied in explicitly.
 */
import { copyFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";

import base from "./vite.config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default mergeConfig(
  base,
  defineConfig({
    publicDir: false,
    build: {
      outDir: "dist-landing",
      emptyOutDir: true,
      rollupOptions: { input: here("./landing.html") },
    },
    plugins: [
      {
        name: "landing-output",
        apply: "build",
        closeBundle() {
          renameSync(here("./dist-landing/landing.html"), here("./dist-landing/index.html"));
          copyFileSync(here("./public/koc-logo.svg"), here("./dist-landing/koc-logo.svg"));
        },
      },
    ],
  }),
);
