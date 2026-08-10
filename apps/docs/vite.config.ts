import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Array form, not the object shorthand, because order is significant here
    // and the `@/` entry MUST be a regex.
    //
    // Vite's string aliases are prefix matches: a plain `"@"` key would also
    // match `@koc/ui` and rewrite it to `<src>koc/ui`. Anchoring on /^@\// means
    // it can only ever match the `@/` alias the shadcn CLI writes, and never a
    // scoped package name. Same class of bug as the `@koc/tokens/css` subpath
    // trap — string aliases are greedier than they look.
    alias: [
      // Workspace packages point at source rather than build output, so the docs
      // site hot-reloads when a component changes instead of needing a rebuild
      // between every edit.
      {
        find: "@koc/ui",
        replacement: fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      },
      {
        find: "@koc/tokens",
        replacement: fileURLToPath(new URL("../../packages/tokens/src", import.meta.url)),
      },
      // Where the shadcn CLI writes installed components. Bake-off candidates
      // land under src/bakeoff/ and are explicitly NOT canonical — see
      // src/bakeoff/README.md.
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./src/", import.meta.url)),
      },
    ],
  },
  server: { port: 4180 },
});
