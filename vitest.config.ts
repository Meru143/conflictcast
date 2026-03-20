import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.ts"],
    exclude: ["test/handlers/testUtils.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/demo/renderOpenedFlow.ts"],
    },
  },
});
