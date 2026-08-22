import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    "out/**",
    ".next/**",
    "src-tauri/target/**",
    "src/components/ui/**",
    "src/hooks/**",
    "next-env.d.ts",
  ]),
]);
