import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/gen/",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache"],
  },
});
