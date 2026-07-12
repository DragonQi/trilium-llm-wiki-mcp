import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/load-env.ts"],
    testTimeout: 30000,
    // Integration tests share one Trilium DB and a common __mcp_test_root__ fixture,
    // so files must run sequentially (default parallelism races cleanup vs. use).
    fileParallelism: false,
  },
});
