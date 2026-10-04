import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig uses `jsx: preserve` for Next; vitest needs the automatic runtime to run .tsx tests.
// `@/*` mirrors tsconfig's paths so hooks that import values through it can be tested.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
