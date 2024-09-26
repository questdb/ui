import { createGlobalStyle, css } from "styled-components"

import { DocSearchStyles } from "./global-styles/docsearch"
import { ReactChromeTabs } from "./global-styles/react-chrome-tabs"

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}
  ${ReactChromeTabs}

  body {
    color: ${({ theme }) => theme.color.foreground};
  }
`
