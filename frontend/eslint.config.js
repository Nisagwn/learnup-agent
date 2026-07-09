import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'android/**',
    'node_modules/**',
    '.vercel/**',
    'emulator_export/**',
    'functions/node_modules/**',
    'functions/.eslintrc.js',
    'scratch_list.js',
    'test_firestore.js',
    'test_firestore.cjs',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_|^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['functions/**/*.js', 'scripts/**/*.js', '*.cjs', '*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
])
