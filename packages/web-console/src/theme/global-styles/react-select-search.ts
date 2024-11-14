import { css } from "styled-components"

export const ReactSelectSearch = css`
  /**
 * Main wrapper
 */
  .select-search-container {
    --select-search-background: ${({ theme }) => theme.color.backgroundDarker};
    --select-search-border: ${({ theme }) => theme.color.selection};
    --select-search-selected: ${({ theme }) => theme.color.selection};
    --select-search-text: ${({ theme }) => theme.color.foreground};
    --select-search-subtle-text: ${({ theme }) => theme.color.gray2};
    --select-search-inverted-text: var(--select-search-background);
    --select-search-highlight: ${({ theme }) => theme.color.comment};

    width: 200px;
    position: relative;
    color: var(--select-search-text);
    box-sizing: border-box;
  }

  .select-search-container *,
  .select-search-container *::after,
  .select-search-container *::before {
    box-sizing: inherit;
  }

  .select-search-input {
    position: relative;
    z-index: 1;
    display: block;
    height: 30px;
    width: 100%;
    padding: 0 0 0 16px;
    background: var(--select-search-background);
    border: 1px solid var(--select-search-border);
    color: var(--select-search-text);
    border-radius: 34x;
    outline: none;
    font-family: var(--select-search-font);
    font-size: 14px;
    text-align: left;
    text-overflow: ellipsis;
    line-height: 30px;
    letter-spacing: 0.01rem;
    -webkit-appearance: none;
    -webkit-font-smoothing: antialiased;
  }

  .select-search-is-multiple .select-search-input {
    margin-bottom: -2px;
  }

  .select-search-is-multiple .select-search-input {
    border-radius: 4px 4px 0 0;
  }

  .select-search-input::-webkit-search-decoration,
  .select-search-input::-webkit-search-cancel-button,
  .select-search-input::-webkit-search-results-button,
  .select-search-input::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  .select-search-input[readonly] {
    cursor: pointer;
  }

  .select-search-is-disabled .select-search-input {
    cursor: not-allowed;
  }

  .select-search-container:not(
      .select-search-is-disabled
    ).select-search-has-focus
    .select-search-input,
  .select-search-container:not(.select-search-is-disabled)
    .select-search-input:hover {
    border-color: var(--select-search-selected);
  }

  .select-search-select {
    background: var(--select-search-background);
    box-shadow: 0 0.0625rem 0.125rem rgba(0, 0, 0, 0.15);
    border: 1px solid var(--select-search-border);
    overflow: auto;
    max-height: 360px;
  }

  .select-search-container:not(.select-search-is-multiple)
    .select-search-select {
    position: absolute;
    z-index: 2;
    top: 32px;
    right: 0;
    left: 0;
    border-radius: 3px;
    display: none;
  }

  .select-search-container:not(
      .select-search-is-multiple
    ).select-search-has-focus
    .select-search-select {
    display: block;
  }

  .select-search-has-focus .select-search-select {
    border-color: var(--select-search-selected);
  }

  .select-search-options {
    list-style: none;
    padding: 0;
  }

  .select-search-option,
  .select-search-not-found {
    display: block;
    height: 30px;
    width: 100%;
    padding: 0 16px;
    background: var(--select-search-background);
    border: none;
    outline: none;
    font-family: var(--select-search-font);
    color: var(--select-search-text);
    font-size: 14px;
    text-align: left;
    letter-spacing: 0.01rem;
    cursor: pointer;
    -webkit-font-smoothing: antialiased;
  }

  .select-search-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent !important;
  }

  .select-search-is-highlighted,
  .select-search-option:not(.select-search-is-selected):hover {
    background: var(--select-search-highlight);
  }

  .select-search-is-selected {
    font-weight: bold;
    color: var(--select-search-text);
    background: var(--select-search-highlight);
  }

  .select-search-group-header {
    font-size: 12px;
    text-transform: uppercase;
    background: var(--select-search-border);
    color: var(--select-search-subtle-text);
    letter-spacing: 0.1rem;
    padding: 10px 16px;
  }

  .select-search-row:not(:first-child) .select-search-group-header {
    margin-top: 10px;
  }

  .select-search-row:not(:last-child) .select-search-group-header {
    margin-bottom: 10px;
  }
`
