// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { fileURLToPath } from "node:url";

// Keep `@/*` in sync with tsconfig.json compilerOptions.paths.
// fallow-ignore-next-line unresolved-import
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [vue()],
  vite: {
    resolve: {
      alias: { "@": srcPath },
    },
  },
});
