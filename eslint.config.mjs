import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The legacy oracle harness (plain Node, CommonJS) and its fixtures; the TypeScript under
    // tools/ is linted like everything else.
    "tools/**/*.js",
    "tools/**/*.json",
    "config/v1/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
