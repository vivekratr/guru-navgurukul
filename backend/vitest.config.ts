import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    // Remote Supabase integration tests routinely exceed 5s under full-suite load.
    testTimeout: 30000,
  },
});
