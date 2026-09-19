import path from "node:path";
import { fileURLToPath } from "node:url";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
        "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
          "warn",
          {
              "vars": "all",
              "varsIgnorePattern": "^_",
              "args": "after-used",
              "argsIgnorePattern": "^_",
              "caughtErrors": "all",
              "caughtErrorsIgnorePattern": "^_"
          },
      ],
    },
  },
  {
    // *.spec.ts est exclu de tsconfig.json (voir ce fichier) pour que tsc
    // tolère l'extension .ts dans les imports des fichiers de test. Cette
    // même exclusion fait échouer le parseur ESLint pris en mode "project" :
    // il exige que chaque fichier linté appartienne au projet TS référencé.
    // Les fichiers de test ne sont déjà pas typés-vérifiés par tsc (coût
    // assumé) ; ne pas non plus les faire linter ici est la même décision.
    ignores: [
      "dist/**",
      "node_modules/**",
      "prisma/migrations/**",
      "eslint.config.mjs",
      "**/*.spec.ts",
    ],
  }
);
