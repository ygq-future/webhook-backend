import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/build',
      '**/coverage',
      '**/.workbuddy',
      'data',
      'bun.lock',
      '**/*.md',
      '**/*.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // shadcn/ui 组件（如 button.tsx）会同时导出组件与 buttonVariants 等常量，
      // 该规则会产生误报；此规则仅影响 HMR 体验、不影响正确性，故关闭以保持 lint 零告警。
      'react-refresh/only-export-components': 'off',
    },
  },
  prettier,
)
