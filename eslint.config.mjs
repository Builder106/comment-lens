import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**", "scanner/tests/fixtures/**"]),
  {
    files: ["editor/vscode/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
