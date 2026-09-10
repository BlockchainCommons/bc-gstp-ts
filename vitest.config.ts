import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
      // Raise-only floors. Seed from the first measured run; never lower.
      thresholds: {
        statements: 55,
        branches: 32,
        functions: 56,
        lines: 56,
      },
    },
  },
});
