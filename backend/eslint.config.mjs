import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // En la app se usa el logger (pino); console solo en scripts de arranque/CLI.
      'no-console': 'warn',
    },
  },
  {
    files: ['src/main.ts', 'src/infrastructure/db/cli.ts'],
    rules: { 'no-console': 'off' },
  },
);
