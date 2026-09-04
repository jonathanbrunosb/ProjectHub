module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'smart'],
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{ts,tsx}', 'src/test/**/*.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      // Providers expoem o hook de consumo junto do componente e o design system
      // expoe helpers ao lado dos componentes. E o padrao adotado no projeto;
      // a regra so afeta o Fast Refresh em desenvolvimento.
      files: [
        'src/app/*Provider.tsx',
        'src/components/ui/Toast.tsx',
        'src/components/ui/DataTable.tsx',
        'src/components/layout/AppShell.tsx',
      ],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
};
