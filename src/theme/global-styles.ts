import { createGlobalStyle } from "styled-components"

import { DocSearchStyles } from "./global-styles/docsearch"

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}

  :root {
    color-scheme: ${({ theme }) => theme.mode};
  }

  html,
  body {
    width: 100%;
    overflow: hidden;
  }

  body {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-family: ${({ theme }) => theme.font};
    background: ${({ theme }) => theme.color.surfaceBase};
    -webkit-font-smoothing: antialiased;
  }

  body[data-scroll-locked] {
    margin-right: 0 !important;
    padding-right: 0 !important;
  }

  #root {
    width: 100%;
    overflow: hidden;
  }

  button,
  input,
  textarea,
  select {
    font-family: ${({ theme }) => theme.font};
  }

  input::selection,
  textarea::selection {
    background-color: ${({ theme }) => theme.color.editorSelection} !important;
    color: ${({ theme }) => theme.color.contentPrimary} !important;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  button:not(:disabled) {
    cursor: pointer;
  }

  button:disabled,
  button[aria-disabled="true"] {
    cursor: not-allowed;
  }

  /* Non-React controls must opt into the same semantic interaction contract. */
  button[data-button-variant="ghost"] {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.color.contentSecondary};
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      filter 120ms ease;
  }

  button[data-button-variant="ghost"]:hover:not(:disabled) {
    border-color: transparent;
    background: ${({ theme }) => theme.color.surfaceRaised};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  button[data-button-variant="ghost"]:active:not(:disabled) {
    filter: brightness(0.9);
  }

  button[data-button-variant="ghost"]:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.borderStrong};
    outline-offset: 2px;
  }

  code,
  pre,
  .monaco-editor,
  .monaco-editor textarea,
  [data-notebook-cell] {
    font-variant-ligatures: none;
  }

  *:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.borderStrong};
    outline-offset: 2px;
  }

  /* Form controls communicate focus through their border. Applying the global
     focus ring as well creates a visually noisy double border. */
  input:focus,
  input:focus-visible,
  textarea:focus,
  textarea:focus-visible,
  select:focus,
  select:focus-visible {
    outline: none;
    outline-offset: 0;
    box-shadow: none;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.scrollbarThumb} transparent;
  }

  .monaco-editor,
  .monaco-editor-background,
  .monaco-editor .margin {
    background-color: ${({ theme }) => theme.color.editorCanvas} !important;
  }

  .monaco-editor .line-numbers {
    color: ${({ theme }) => theme.color.contentDisabled} !important;
    font-family: ${({ theme }) => theme.fontMonospace} !important;
  }

  .monaco-editor .suggest-widget {
    background-color: ${({ theme }) => theme.color.surfaceOverlay} !important;
    border: 1px solid ${({ theme }) => theme.color.borderDefault} !important;
    border-radius: 0.6rem !important;
    box-shadow: 0 18px 48px ${({ theme }) => theme.color.shadowStrong} !important;
    overflow: hidden;
  }

  .monaco-editor .quick-input-widget {
    background-color: ${({ theme }) => theme.color.surfaceOverlay} !important;
    border: 1px solid ${({ theme }) => theme.color.borderDefault} !important;
    border-radius: 0.6rem !important;
    box-shadow: 0 18px 48px ${({ theme }) => theme.color.shadowStrong} !important;
    overflow: hidden;
  }

  /* Monaco normally replaces every focused completion icon with one shared
     selected foreground. Restore the completion-kind colors used by the SQL
     provider so selection changes only the row background. */
  .monaco-editor .suggest-widget .monaco-list-row.focused {
    .codicon-symbol-class {
      color: var(--vscode-symbolIcon-classForeground) !important;
    }

    .codicon-symbol-function {
      color: var(--vscode-symbolIcon-functionForeground) !important;
    }

    .codicon-symbol-field {
      color: var(--vscode-symbolIcon-fieldForeground) !important;
    }

    .codicon-symbol-enum,
    .codicon-symbol-value {
      color: var(--vscode-symbolIcon-enumeratorForeground) !important;
    }

    .codicon-symbol-keyword {
      color: var(--vscode-symbolIcon-keywordForeground) !important;
    }

    .codicon-symbol-operator {
      color: var(--vscode-symbolIcon-operatorForeground) !important;
    }

    .codicon-symbol-type-parameter {
      color: var(--vscode-symbolIcon-typeParameterForeground) !important;
    }
  }

  .allotment-module_splitView__L-yRc > .allotment-module_sashContainer__fzwJF > .allotment-module_sash__QA-2t::before {
    background: ${({ theme }) => theme.color.borderSubtle};
    transition: background 160ms ease;
  }

  .allotment-module_splitView__L-yRc > .allotment-module_sashContainer__fzwJF > .allotment-module_sash__QA-2t:hover::before {
    background: ${({ theme }) => theme.color.borderStrong};
  }
`
