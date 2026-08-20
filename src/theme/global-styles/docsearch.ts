import docSearchBaseStyles from "@docsearch/css?inline"
import { css, type DefaultTheme } from "styled-components"
import { makeButtonVariant } from "../../components/Button/variants"
import { TOOLBAR_CONTROL_HEIGHT } from "../../components/Button/tokens"
import { shortcutKeycapStyles } from "../../components/Key/styles"

const docSearchVariablePattern =
  /var\(--docsearch-([a-z0-9-]+)(?:,\s*[^)]+)?\)/g
const docSearchDeclarationPattern = /--docsearch-[a-z0-9-]+\s*:[^;{}]+;?/g

const resolveDocSearchBaseStyles = (theme: DefaultTheme): string => {
  const keyShadow = `inset 0 -2px 0 0 ${theme.color.borderStrong}, inset 0 0 1px 1px ${theme.color.controlSurfaceHover}, 0 2px 2px 0 ${theme.color.shadowSoft}`
  const values: Record<string, string> = {
    "primary-color": theme.color.contentAccent,
    "text-color": theme.color.contentPrimary,
    spacing: "12px",
    "icon-stroke-width": "1.4",
    "highlight-color": theme.color.contentAccent,
    "muted-color": theme.color.contentSecondary,
    "container-background": theme.color.surfaceScrim,
    "logo-color": theme.color.contentPrimary,
    "modal-width": "560px",
    "modal-height": "600px",
    "modal-background": theme.color.surfaceOverlay,
    "modal-shadow": `inset 1px 1px 0 0 ${theme.color.borderDefault}, 0 3px 8px 0 ${theme.color.shadowOverlay}`,
    "searchbox-height": "56px",
    "searchbox-background": theme.color.surfaceInput,
    "searchbox-focus-background": theme.color.surfaceOverlay,
    "searchbox-shadow": `inset 0 0 0 2px ${theme.color.contentAccent}`,
    "hit-height": "56px",
    "hit-color": theme.color.contentPrimary,
    "hit-active-color": theme.color.contentInverse,
    "hit-background": theme.color.surfaceRaised,
    "hit-shadow": "none",
    "key-gradient": `linear-gradient(-26.5deg, ${theme.color.controlSurface} 0%, ${theme.color.interactionNeutral} 100%)`,
    "key-shadow": keyShadow,
    "key-pressed-shadow": keyShadow,
    "footer-height": "44px",
    "footer-background": theme.color.surfaceOverlay,
    "footer-shadow": `inset 0 1px 0 0 ${theme.color.borderDefault}, 0 -4px 8px 0 ${theme.color.shadowSoft}`,
    "icon-color": theme.color.contentAccent,
    vh: "1dvh",
  }

  return docSearchBaseStyles
    .replace(docSearchVariablePattern, (token, name: string) =>
      name in values ? values[name] : token,
    )
    .replace(docSearchDeclarationPattern, "")
}

export const DocSearchStyles = css`
  ${({ theme }) => resolveDocSearchBaseStyles(theme)}

  :root {
    .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS.allotment-module_vertical__WSwwa
      > .allotment-module_splitViewContainer__rQnVa
      > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
      height: 2px;
    }
    .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS.allotment-module_horizontal__7doS8
      > .allotment-module_splitViewContainer__rQnVa
      > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
      width: 2px;
    }
  }
  .sash {
    ::before {
      transition: none;
    }
  }

  // Allotment clips its absolutely-positioned panes with overflow:hidden, which also
  // makes the split view a scroll container; a collapsed-pane sash then pokes a few px
  // past the edge and lets scrollIntoView/focus drag the whole shell. clip keeps the
  // clipping but is not scrollable.
  .split-view.split-view-vertical,
  .split-view.split-view-horizontal {
    overflow: clip;
  }

  .DocSearch.DocSearch-Button {
    box-sizing: border-box;
    height: ${TOOLBAR_CONTROL_HEIGHT};
    min-height: ${TOOLBAR_CONTROL_HEIGHT};
    max-height: ${TOOLBAR_CONTROL_HEIGHT};
    padding: 0 1.2rem;
    gap: 0.6rem;
    border-radius: 0.4rem;
    border: 1px solid transparent;
    margin-left: 0;
    font: inherit;
    font-size: ${({ theme }) => theme.fontSize.sm};
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1.15;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      filter 150ms ease;

    ${makeButtonVariant("secondary")}
  }

  .DocSearch.DocSearch-Button:hover {
    box-shadow: none;
  }

  .DocSearch.DocSearch-Button:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.contentAccent};
    outline-offset: 2px;
  }

  .DocSearch-Button-Placeholder {
    font-size: 100%;
    padding: 0;
    margin-left: 0.6rem;
  }

  .DocSearch-Button .DocSearch-Search-Icon {
    color: inherit;
    width: 1.6rem;
    height: 1.6rem;
  }

  .DocSearch-Button:hover .DocSearch-Search-Icon {
    color: inherit;
  }

  .DocSearch-Button-Keys {
    min-width: 0;
    margin-left: 1rem;
  }

  .DocSearch-Button-Key {
    ${shortcutKeycapStyles}

    color: ${({ theme }) => theme.color.contentSecondary};
  }

  .DocSearch-Hit-title {
    font-size: 100%;
    overflow: hidden;
  }

  .DocSearch-Logo .cls-1,
  .DocSearch-Logo .cls-2 {
    fill: ${({ theme }) => theme.color.contentPrimary} !important;
  }
`
