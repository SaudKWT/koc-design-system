import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Point the workspace packages at source rather than build output, so the
      // docs site hot-reloads when a component changes instead of needing a
      // rebuild between every edit.
      "@koc/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      "@koc/tokens": fileURLToPath(new URL("../../packages/tokens/src", import.meta.url)),
    },
  },
  server: { port: 4180 },
});
