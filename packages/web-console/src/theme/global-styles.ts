import { createGlobalStyle } from "styled-components"

import { DocSearchStyles } from "./global-styles/docsearch"

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}

  body {
    color: ${({ theme }) => theme.color.foreground};
  }
`
