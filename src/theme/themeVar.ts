import type { ColorShape } from "types"

// Imperative consumers (e.g. Toastify) retain style objects across theme changes.
// Use typed live variables there; styled components should use theme.color.
export const themeVar = (token: keyof ColorShape): string =>
  `var(--qdb-color-${token})`
