import { createGlobalStyle, css } from "styled-components"

const DocSearchStyles = css`
  :root {
    --docsearch-primary-color: ${({ theme }) => theme.color.pink};
    --docsearch-text-color: ${({ theme }) => theme.color.foreground};
    --docsearch-highlight-color: ${({ theme }) => theme.color.pink};
    --docsearch-muted-color: #a4a6a8;
    --docsearch-container-background: rgba(0, 0, 0, 0.5);
    /* Modal */
    --docsearch-modal-background: ${({ theme }) => theme.color.background};
    --docsearch-modal-shadow: inset 1px 1px 0 0 #2c2e40, 0 3px 8px 0 #000309;
    /* Search box */
    --docsearch-searchbox-background: #2d303e;
    --docsearch-searchbox-focus-background: #141725;
    /* Hit */
    --docsearch-hit-color: ${({ theme }) => theme.color.foreground};
    --docsearch-hit-active-color: ${({ theme }) => theme.color.foreground};
    --docsearch-hit-background: ${({ theme }) => theme.color.backgroundLighter};
    --docsearch-hit-shadow: none;
    /* Footer */
    --docsearch-footer-background: ${({ theme }) => theme.color.background};
    --docsearch-footer-shadow: inset 0 1px 0 0 rgba(73, 76, 106, 0.5),
      0 -4px 8px 0 rgba(0, 0, 0, 0.2);
    /* Keys */
    --docsearch-key-gradient: linear-gradient(
      -26.5deg,
      #32343e 0%,
      rgb(38, 40, 51) 100%
    );
    --docsearch-key-shadow: inset 0 -2px 0 0 #282d55, inset 0 0 1px 1px #51577d,
      0 2px 2px 0 rgba(3, 4, 9, 0.3);

    // Allotment styling
    --focus-border: ${({ theme }) => theme.color.purple};
    --separator-border: ${({ theme }) => theme.color.backgroundDarker};
    --sash-size: 2rem;
    --sash-hover-size: 0.5rem;
  }

  .DocSearch-Button {
    height: 3rem;
    border-radius: 0.4rem;
    color: ${({ theme }) => theme.color.foreground};
    border: 1px solid var(--docsearch-searchbox-background);
  }

  .DocSearch-Button:hover {
    background: ${({ theme }) => theme.color.comment};
    box-shadow: none;
  }

  .DocSearch-Button-Placeholder {
    font-size: 100%;
  }

  .DocSearch-Button .DocSearch-Search-Icon {
    color: ${({ theme }) => theme.color.foreground};
    width: 1.4rem;
    height: 1.4rem;
  }

  .DocSearch-Button:hover .DocSearch-Search-Icon {
    color: ${({ theme }) => theme.color.foreground};
  }

  .DocSearch-Button-Key {
    top: 0;
    padding: 0 4px;
    background: ${({ theme }) => theme.color.gray2};
    border-radius: 2px;
    box-shadow: none;
    color: ${({ theme }) => theme.color.black};
    font-size: 1.2rem;
    font-style: inherit;
    font-family: inherit;
    font-weight: 600;
  }

  .DocSearch-Hit-title {
    font-size: 100%;
    overflow: hidden;
  }

  .DocSearch-Logo .cls-1,
  .DocSearch-Logo .cls-2 {
    fill: ${({ theme }) => theme.color.foreground} !important;
  }
`

export const GlobalStyle = createGlobalStyle`
  ${DocSearchStyles}

  body {
    color: ${({ theme }) => theme.color.foreground};
  }
`
