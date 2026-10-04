import { defineConfig } from "vitest/config";

// tsconfig uses `jsx: preserve` for Next; vitest needs the automatic runtime to run .tsx tests.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});
