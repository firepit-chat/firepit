import path from "node:path";
import { cpus } from "node:os";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const parsedMaxWorkers = Number(process.env.VITEST_MAX_WORKERS);
const maxWorkerAmt =
  Number.isFinite(parsedMaxWorkers) && parsedMaxWorkers > 0
    ? Math.floor(parsedMaxWorkers)
    : Math.max(1, Math.min(10, cpus().length));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    server: {
      deps: {
        // Process the theme library through Vite instead of letting Node
        // resolve it. It is ESM-only and imports "next/navigation" without a
        // file extension, which Node's resolver rejects.
        inline: [/@teispace\/next-themes/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/__tests__/__helpers__/**",
        "**/__tests__/setup.ts",
      ],
    },
    maxWorkers: maxWorkerAmt,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // @teispace/next-themes imports useServerInsertedHTML from
      // "next/navigation" without a file extension, which the Vite resolver
      // rejects. Tests that need the real router already mock this module
      // themselves, so aliasing it only affects the library's internal import
      // and lets tests exercise the real provider.
      "next/navigation": path.resolve(
        __dirname,
        "src/__tests__/__helpers__/next-navigation-stub.ts",
      ),
    },
  },
});
