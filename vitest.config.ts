import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.ts"],
    exclude: ["test/handlers/testUtils.ts"],
    coverage: {
      provider: "v8",
    },
  },
});
