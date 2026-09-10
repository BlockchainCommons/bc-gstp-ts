import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { resolve } from "node:path";

/*
 * Strict, type-checked ESLint flat config for the @blockchaincommons/gstp library.
 * (Migrated from the @bcts/eslint shared config, inlined here so the package
 * is self-contained.)
 */
const project = resolve(process.cwd(), "./tsconfig.json");

export default [
  js.configs.recommended,
  // Source code rules - strict type checking
  {
    files: ["src/**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project,
      },
      globals: {
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended-type-checked"].rules,
      ...tsPlugin.configs["stylistic-type-checked"].rules,

      // Conflicts with tsconfig `isolatedDeclarations`, which REQUIRES
      // explicit annotations on exported consts the rule deems inferrable.
      "@typescript-eslint/no-inferrable-types": "off",

      // Conflicts with tsconfig `isolatedDeclarations`, which REQUIRES a type
      // annotation on the exported variable; this rule wants that annotation
      // removed in favour of a constructor type argument.
      "@typescript-eslint/consistent-generic-constructors": "off",

      // Type safety errors
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "error",

      // Code quality
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        {
          fixMixedExportsWithInlineTypeSpecifier: true,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",

      // Cross-environment compatibility
      "no-restricted-globals": [
        "error",
        { name: "process", message: "Use platform detection instead" },
        { name: "Buffer", message: "Use Uint8Array for cross-platform compatibility" },
        { name: "__dirname", message: "Not available in all environments" },
        { name: "__filename", message: "Not available in all environments" },
        { name: "window", message: "Not available in Node.js/Bun" },
        { name: "document", message: "Not available in Node.js/Bun" },
        { name: "navigator", message: "Not available in Node.js/Bun" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'NewExpression[callee.name="Buffer"]',
          message: "Use Uint8Array instead of Buffer for cross-platform compatibility",
        },
      ],

      // Best practices for library code
      "no-console": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "no-throw-literal": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      // A value and a type may intentionally share a name (e.g. `MajorType`,
      // `Cbor`, `EdgeType`); tsc already rejects genuine illegal redeclarations.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },
  // Executable entry points inside a library: these run in Node.js and are
  // expected to use process, console and friends.
  {
    files: ["src/bin/**/*.ts", "src/cmd/**/*.ts", "src/cli.ts", "src/main.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project,
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended-type-checked"].rules,
      "no-console": "off",
      "no-restricted-globals": "off",
      "no-restricted-syntax": "off",
      "no-undef": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Test file rules - relaxed for testing
  {
    files: ["tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project,
      },
      globals: {
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
        console: "readonly",
        Buffer: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  // Ignore patterns
  {
    ignores: [
      "tests/baseline/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "build/**",
      "docs/**",
      "examples/**",
      "scripts/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
];
