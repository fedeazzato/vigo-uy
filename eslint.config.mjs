import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'src/lib/database.types.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The classic hooks rules only — the v6 compiler-era diagnostics
      // (set-state-in-effect, immutability, …) are not adopted yet.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Vite HMR: components must be the only exports of a module for fast
      // refresh; constants exported alongside are allowed on purpose here.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Async JSX handlers (onClick={async () => …}) are fine: React ignores
      // the returned promise, and every handler does its own error handling.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    // Context modules export their hook (useAuth, useUserPrefs, …) and
    // constants next to the provider on purpose; same for the files whose
    // extra exports exist for tests or shared config.
    files: ['src/context/**/*.tsx', 'src/components/GuideLinks.tsx', 'src/components/TurnstileWidget.tsx', 'src/pages/CostsPage.tsx', 'src/pages/NewTripLogPage.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // `await act(async () => …)` is the react-testing-library idiom for
    // flushing effects; the callback legitimately has no await of its own.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  }
)
