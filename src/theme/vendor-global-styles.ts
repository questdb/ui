import allotmentBaseStyles from "allotment/dist/style.css?inline"
import { createGlobalStyle, type DefaultTheme } from "styled-components"

const allotmentVariablePattern = /var\(--([a-z0-9-]+)\)/g
const allotmentDeclarationPattern = /--[a-z0-9-]+\s*:[^;{}]+;?/g

const resolveAllotmentStyles = (theme: DefaultTheme): string => {
  const values: Record<string, string> = {
    "separator-border": theme.color.transparent,
    "focus-border": theme.color.contentMuted,
    "sash-size": "1.5rem",
    "sash-hover-size": "0.5rem",
    "sash-hover-transition-duration": "0.1s",
  }

  return allotmentBaseStyles
    .replace(allotmentVariablePattern, (token, name: string) =>
      name in values ? values[name] : token,
    )
    .replace(allotmentDeclarationPattern, "")
}

export const VendorGlobalStyle = createGlobalStyle`
  ${({ theme }) => resolveAllotmentStyles(theme)}
`
