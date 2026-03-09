import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const rawTmplPlugin = (): Plugin => ({
  name: "raw-tmpl",
  load(id) {
    if (id.endsWith(".tmpl")) {
      const content = readFileSync(id, "utf-8");
      return `export default ${JSON.stringify(content)};`;
    }
  },
});

export default defineConfig({
  plugins: [rawTmplPlugin()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
