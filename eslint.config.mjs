import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript.map(config => ({ ...config, files: ["**/*.ts", "**/*.tsx", "**/*.cts"] })),
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "prisma.config.ts", "scripts/*.d.cts", "tests/**/*.ts", "tests/**/*.tsx"],
    languageOptions: { parserOptions: { project: ["./tsconfig.json", "./tsconfig.type-tests.json", "./tsconfig.tests.json"], tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "no-restricted-syntax": ["error", {
        selector: "TSAsExpression > TSAsExpression, TSAsExpression > TSTypeAssertion, TSTypeAssertion > TSAsExpression, TSTypeAssertion > TSTypeAssertion",
        message: "No encadenar conversiones de tipo. Validar o acotar el dato en su frontera.",
      }],
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description", "minimumDescriptionLength": 10 }],
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    ignores: ["tests/types/**"],
    rules: {
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "estados_cuenta/**",
  ]),
]);

export default eslintConfig;
