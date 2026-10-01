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
import { ALWAYS, NEVER } from "./src/landing-motion-css";

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
        // The CSS half of src/landing-motion.ts: the hosted comparison ignores the
        // OS reduced-motion setting (Saud, 2026-10-01). Rewrites every
        // prefers-reduced-motion feature in the emitted CSS. `reduce` never
        // matches, `no-preference` always does. html[data-force-reduced-motion]
        // rules, which drive the viewer's manual switch, are untouched.
        name: "ignore-os-reduced-motion",
        apply: "build",
        generateBundle(_options, bundle) {
          for (const file of Object.values(bundle)) {
            if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
            file.source = String(file.source)
              .replace(/\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g, ALWAYS)
              .replace(/\(\s*prefers-reduced-motion\s*(?::\s*reduce\s*)?\)/g, NEVER);
          }
        },
      },
      {
        name: "landing-output",
        apply: "build",
        closeBundle() {
          renameSync(here("./dist-landing/landing.html"), here("./dist-landing/index.html"));
          copyFileSync(here("./public/koc-logo.svg"), here("./dist-landing/koc-logo.svg"));
          // A dependency-free page that reports reduced-motion and GPU state, for
          // diagnosing "animations don't play" on locked-down work PCs.
          copyFileSync(here("./landing-diag.html"), here("./dist-landing/diag.html"));
        },
      },
    ],
  }),
);
