import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['node_modules/**', '.wxt/**', '.output/**', '.playwright-cli/**', 'output/**', 'artifacts/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
);
