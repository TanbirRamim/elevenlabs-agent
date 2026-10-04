import { defineConfig } from "vitest/config";

// Next.js needs tsconfig `jsx: "preserve"`, but vitest's oxc transform would then
// leave JSX untransformed and fail to parse .tsx. Force the automatic runtime here.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});
