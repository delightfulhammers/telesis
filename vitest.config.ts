import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const rawTextPlugin = (): Plugin => ({
  name: "raw-text",
  load(id) {
    if (id.endsWith(".tmpl") || id.endsWith(".md")) {
      const content = readFileSync(id, "utf-8");
      return `export default ${JSON.stringify(content)};`;
    }
  },
});

export default defineConfig({
  plugins: [rawTextPlugin()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
