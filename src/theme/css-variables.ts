import { createGlobalStyle, type DefaultTheme } from "styled-components"

const declarations = (theme: DefaultTheme): string =>
  [
    ...Object.entries(theme.color).map(
      ([name, value]) => `--qdb-color-${name}: ${value};`,
    ),
    `--qdb-font-sans: ${theme.font};`,
    `--qdb-font-mono: ${theme.fontMonospace};`,
  ].join("\n    ")

export const ThemeCssVariables = createGlobalStyle`
  :root {
    ${({ theme }) => declarations(theme)}
  }
`
