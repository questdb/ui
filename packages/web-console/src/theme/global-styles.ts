import { createGlobalStyle } from "styled-components"

import { DocSearchStyles } from "./global-styles/docsearch"
import { ReactSelectSearch } from "./global-styles/react-select-search"

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}
  ${ReactSelectSearch}

  body {
    color: ${({ theme }) => theme.color.foreground};
  }
`
