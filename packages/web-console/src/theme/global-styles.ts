import { createGlobalStyle } from "styled-components"

import { DocSearchStyles } from "./global-styles/docsearch"
import { ReactChromeTabs } from "./global-styles/react-chrome-tabs"
import { ReactSelectSearch } from "./global-styles/react-select-search"

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}
  ${ReactChromeTabs}
  ${ReactSelectSearch}

  body {
    color: ${({ theme }) => theme.color.foreground};
  }
`
