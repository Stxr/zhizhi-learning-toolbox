import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default [{ignores:['node_modules/**','.local/**','dist/**']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.mjs'],languageOptions:{globals:globals.node}},{files:['src/**/*.{ts,tsx}'],languageOptions:{globals:globals.browser},plugins:{'react-hooks':hooks},rules:{...hooks.configs.recommended.rules,'@typescript-eslint/no-explicit-any':'off'}}];
