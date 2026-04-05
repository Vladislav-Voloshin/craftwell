import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "coverage/**",
  ]),
  {
    // Prevent accidental console.log/warn/error from landing in production code.
    // Use the structured pino logger (src/lib/logger.ts) for server code and
    // clientLogger (src/lib/client-logger.ts) for browser code instead.
    // Intentional console use must be wrapped in eslint-disable-next-line no-console.
    // Error boundaries (error.tsx, global-error.tsx) are exempt — they are the
    // last-resort handler and cannot safely import app-level modules.
    rules: {
      "no-console": "error",
    },
    ignores: [
      "src/app/error.tsx",
      "src/app/global-error.tsx",
      "src/app/**/error.tsx",
    ],
  },
]);

export default eslintConfig;
