import type { DefaultTheme } from "styled-components"
import { withAlpha } from "../../../theme"

// The demo scene's colours, from the console's theme, so it shows the
// console as the user sees it, dark or light. The CSS reads them as custom
// properties; the charts read them directly.

export type ScenePalette = {
  canvas: string
  base: string
  inset: string
  raised: string
  input: string
  border: string
  borderSubtle: string
  // The console's frame on the stage: light needs a firmer edge and a lift.
  frame: string
  frameShadow: string
  neutral: string
  control: string
  primary: string
  secondary: string
  muted: string
  disabled: string
  accent: string
  action: string
  info: string
  success: string
  danger: string
  warning: string
  positive: string
  negative: string
  gridRow: string
  gridHeader: string
  userBubble: string
  tick: string
  // Charts
  up: string
  down: string
  eur: string
  gbp: string
  vwap: string
  grid: string
  crossBox: string
  crossText: string
}

export const scenePaletteOf = (theme: DefaultTheme): ScenePalette => {
  const c = theme.color
  const dark = theme.mode === "dark"
  return {
    canvas: c.surfaceStage,
    base: c.surfaceBase,
    inset: c.surfaceInset,
    raised: c.surfaceRaised,
    input: c.surfaceInput,
    border: c.borderDefault,
    borderSubtle: c.borderSubtle,
    frame: dark ? c.borderSubtle : c.borderDefault,
    frameShadow: dark
      ? "none"
      : `0 1px 2px ${c.shadowSubtle}, 0 4px 14px ${c.shadowSoft}`,
    neutral: c.interactionNeutral,
    control: c.controlSurface,
    primary: c.contentPrimary,
    secondary: c.contentSecondary,
    muted: c.contentMuted,
    disabled: c.contentDisabled,
    accent: c.contentAccent,
    action: c.actionPrimary,
    info: c.statusInfo,
    success: c.statusSuccess,
    danger: c.statusDanger,
    warning: c.statusWarning,
    positive: c.dataPositive,
    negative: c.dataNegative,
    gridRow: c.gridRow,
    gridHeader: c.gridHeader,
    // The chat's own message bubble, as MessageBubble draws it.
    userBubble: dark ? c.authBackdrop : c.surfaceValue,
    tick: c.aiPinkStart,
    // Candles: the chart up/down colours of the notebook charts.
    up: dark ? "#2ebd85" : "#0f9f7a",
    down: dark ? "#f6465d" : "#e0364a",
    eur: c.chartSeries1,
    gbp: c.chartSeries2,
    vwap: c.chartSeries3,
    grid: c.dataGrid,
    crossBox: dark ? c.borderStrong : c.contentSecondary,
    crossText: dark ? c.contentPrimary : c.surfaceValue,
  }
}

// Custom properties for the scene's CSS and markup.
export const sceneVarsOf = (p: ScenePalette): string => `
  --canvas: ${p.canvas};
  --base: ${p.base};
  --inset: ${p.inset};
  --raised: ${p.raised};
  --input: ${p.input};
  --border: ${p.border};
  --border-subtle: ${p.borderSubtle};
  --frame: ${p.frame};
  --frame-shadow: ${p.frameShadow};
  --neutral: ${p.neutral};
  --control: ${p.control};
  --primary: ${p.primary};
  --secondary: ${p.secondary};
  --muted: ${p.muted};
  --disabled: ${p.disabled};
  --accent: ${p.accent};
  --accent-ring: ${withAlpha(p.accent, 0.55)};
  --action: ${p.action};
  --info: ${p.info};
  --success: ${p.success};
  --success-ring: ${withAlpha(p.success, 0.2)};
  --danger: ${p.danger};
  --warning: ${p.warning};
  --warn-soft: ${withAlpha(p.warning, 0.19)};
  --positive: ${p.positive};
  --negative: ${p.negative};
  --positive-flash: ${withAlpha(p.positive, 0.55)};
  --negative-flash: ${withAlpha(p.negative, 0.55)};
  --grid-row: ${p.gridRow};
  --grid-header: ${p.gridHeader};
  --user: ${p.userBubble};
  --tick: ${p.tick};
  --spin-track: ${withAlpha(p.primary, 0.18)};
  --up: ${p.up};
  --down: ${p.down};
  --up-soft: ${withAlpha(p.up, 0.22)};
  --down-soft: ${withAlpha(p.down, 0.22)};
  --bar-soft: ${withAlpha(p.secondary, 0.2)};
  --band-legend: ${withAlpha(p.secondary, 0.45)};
  --eur: ${p.eur};
  --gbp: ${p.gbp};
  --vwap: ${p.vwap};
  --axis: ${p.muted};
`
