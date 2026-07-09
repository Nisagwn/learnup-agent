// ESLint flat config (ESM) — typescript-eslint tabanlı, tip-bilgisiz (hızlı) preset.
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Blueprint'lerde OpenAI/DeepSeek dinamik yanıt tipleri için `any` kullanılabiliyor.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
