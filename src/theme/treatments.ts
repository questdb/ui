import type { ColorShape } from "../types"

/**
 * PR-review palette overlays. `/` is the control (shipped tokens).
 * `?treatment=a|b` or `/review/a|b` apply the matching overlay.
 * Remove before merging to main.
 *
 * Treatment A retunes the isolated `brand*` roles (rail latch + Run query)
 * toward a brighter magenta. Leftover chrome stays on `contentAccent` /
 * `actionPrimary`.
 *
 * Treatment B restyles Run query as a secondary success (green well, distinct
 * stroke, mode-aware type) and moves the rail latch onto the info cyan
 * family. Leftover chrome stays on `contentAccent` / `actionPrimary`.
 */
export type ThemeTreatmentId = "control" | "a" | "b"

export type ThemeTreatmentOverlay = {
  dark: Partial<ColorShape>
  light: Partial<ColorShape>
}

export const themeTreatments: Record<ThemeTreatmentId, ThemeTreatmentOverlay> =
  {
    control: {
      dark: {},
      light: {},
    },
    a: {
      dark: {
        brandAccent: "#f042a7",
        brandAccentActive: "rgba(240, 66, 167, 0.15)",
        brandAction: "#bd0f74",
        brandActionHover: "#d4117e",
        brandActionBorder: "#bd0f74",
      },
      light: {
        brandAccent: "#bd0f74",
        brandAccentActive: "rgba(189, 15, 116, 0.13)",
        brandAction: "#8e0b57",
        brandActionHover: "#bd0f74",
        brandActionBorder: "#8e0b57",
      },
    },
    b: {
      dark: {
        brandAccent: "#81d3f9",
        brandAccentActive: "rgba(178, 231, 255, 0.075)",
        brandAccentBorder: "rgba(178, 231, 255, 0.14)",
        brandAction: "#27723a",
        brandActionHover: "#367f47",
        brandActionBorder: "#34d55c",
        brandActionForeground: "#f8f8f2",
      },
      light: {
        brandAccent: "#176f87",
        brandAccentActive: "rgba(21, 156, 193, 0.075)",
        brandAccentBorder: "rgba(21, 156, 193, 0.14)",
        brandAction: "#b3e5c1",
        brandActionHover: "#88dda0",
        brandActionBorder: "#27723c",
        brandActionForeground: "#1c2029",
      },
    },
  }

const isTreatmentId = (value: string | null): value is ThemeTreatmentId =>
  value === "control" || value === "a" || value === "b"

export const readThemeTreatment = (
  location: Pick<Location, "pathname" | "search"> = window.location,
): ThemeTreatmentId => {
  const fromQuery = new URLSearchParams(location.search).get("treatment")
  if (isTreatmentId(fromQuery)) {
    return fromQuery
  }

  const path = location.pathname.replace(/\/+$/, "") || "/"
  if (path.endsWith("/review/a")) return "a"
  if (path.endsWith("/review/b")) return "b"
  if (path.endsWith("/review/control")) return "control"
  return "control"
}
