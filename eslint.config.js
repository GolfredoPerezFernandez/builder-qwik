// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { qwikEslint9Plugin } from 'eslint-plugin-qwik';

export default tseslint.config(
  {
    ignores: [
      'node_modules/*',
      'dist/*',
      'server/*',
      'tmp/*',
      'build/*',
      '*.min.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  qwikEslint9Plugin.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Reglas de TypeScript
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": ["error"],
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-unnecessary-condition": "off",

      // Reglas generales
      "prefer-spread": "off",
      "no-case-declarations": "off",
      "no-console": "off",

      // Reglas específicas de Qwik para detectar problemas de QRL
      "qwik/valid-lexical-scope": "error", // ¡Esto detectará problemas como withinRange!
      "qwik/use-method-usage": "error",
      "qwik/no-react-props": "error",
      "qwik/no-use-visible-task": "off",
    },
  }
);