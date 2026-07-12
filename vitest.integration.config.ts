import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/load-env.ts"],
    testTimeout: 30000,
  },
});
