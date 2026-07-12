import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Node >= 18 globals needed by plain-JS files (no-undef applies to .mjs/.js,
// but typescript-eslint disables it for .ts since tsc already checks).
const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  fetch: "readonly",
  URL: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  AbortController: "readonly",
  globalThis: "writable",
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "trilium-data/**", "coverage/**"],
  },
  {
    files: ["scripts/**/*.mjs", "**/*.mjs", "eslint.config.js"],
    languageOptions: { globals: nodeGlobals },
  },
);
