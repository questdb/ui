/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'
import { Linter } from 'eslint'

export default [
  {
    ignores: ['dist/', 'node_modules/', 'eslint.config.ts'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
      },
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.reduce((acc, config) => ({ ...acc, ...config.rules }), {}),
      ...tseslint.configs.recommendedTypeChecked.reduce((acc, config) => ({ ...acc, ...config.rules }), {}),
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
            "warn",
            {
                caughtErrors: "none",
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_"
            }
        ],
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          "checksVoidReturn": false
        }
      ],
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",

      'react/display-name': 'off',
      'react/jsx-no-bind': 'off',
      'react/prop-types': 'off',
      'react/no-deprecated': 'error',
      'react/style-prop-object': 'error',
      'react/self-closing-comp': 'error',
      'react/no-unused-prop-types': 'warn',
      'react/no-unused-state': 'warn',
      'react/no-this-in-sfc': 'error',
      'react/no-typos': 'error',
      'react/no-redundant-should-component-update': 'error',
      'react/no-array-index-key': 'error',
      'react/jsx-closing-bracket-location': 'error',
      'react/jsx-closing-tag-location': 'error',
      'react/jsx-equals-spacing': 'error',
      'react/jsx-first-prop-new-line': 'error',
      'react/jsx-indent': ['error', 2],
      'react/jsx-indent-props': ['error', 2],
      'react/jsx-pascal-case': 'error',
      'react/jsx-sort-props': 'off',
      'react/sort-default-props': 'error',
      'react/jsx-wrap-multilines': 'error',
      'react/jsx-tag-spacing': [
        'error',
        {
          closingSlash: 'never',
          beforeSelfClosing: 'always',
          afterOpening: 'never',
          beforeClosing: 'never',
        },
      ],
      'react/jsx-boolean-value': 'error',
      'react/jsx-curly-spacing': 'error',
      'react/jsx-no-comment-textnodes': 'warn',
      'react/jsx-curly-brace-presence': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'jsx-quotes': ['error', 'prefer-double'],
      'quote-props': ['error', 'as-needed'],
      'object-shorthand': ['error', 'always'],
      'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
      'no-var': ['error'],
      'no-void': 'off',
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error', 'info'],
        },
      ],

      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },

  prettierConfig,
] satisfies Linter.Config[]
