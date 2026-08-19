/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import type { DefaultTheme as DefaultThemeShape } from "styled-components"
import type { ColorShape, FontSizeShape, ThemeMode } from "types"

/**
 * Roles whose visual identity must not change with application luminance.
 * Spreading this source into both palettes keeps the runtime color object flat
 * without allowing light mode to inherit arbitrary dark-mode additions.
 */
const invariantColors = {
  // Utility
  transparent: "transparent",

  // Content on fixed saturated surfaces
  contentInverse: "#f8f8f2",
  contentOnWarning: "#000000",

  // Opaque black anchor for masks, picker gradients, and glyphs that sit on
  // arbitrary fills rather than on themed surfaces
  neutralInk: "#000000",

  // Assistant progress and completion feedback
  statusAssistant: "#d14671",
  statusAssistantStrong: "#892c6c",

  // Fixed-purpose colors
  instancePreset1: "rgb(199, 7, 45)",
  instancePreset2: "rgb(0, 170, 59)",
  instancePreset3: "rgb(0, 122, 255)",
  windowControlClose: "#ff5f57",
  windowControlMinimize: "#febc2e",
  windowControlExpand: "#28c840",
  pickerHue0: "#ff0000",
  pickerHue1: "#ffff00",
  pickerHue2: "#00ff00",
  pickerHue3: "#00ffff",
  pickerHue4: "#0000ff",
  pickerHue5: "#ff00ff",
} satisfies Partial<ColorShape>

export const darkColors: ColorShape = {
  ...invariantColors,

  // Onboarding experience
  onboardingSurface: "#050505",
  onboardingDivider: "rgba(222, 222, 222, 0.04)",
  onboardingClose: "#858585",
  onboardingCommand: "#111111",
  onboardingInput: "#202020",
  onboardingPrompt: "#93adff",
  onboardingAccent: "#29c6be",

  // Surfaces
  surfaceCanvas: "#141725",
  surfaceStage: "#0c0d11",
  surfaceBase: "#17181d",
  surfaceInset: "#121317",
  surfaceRaised: "#1d1e24",
  surfaceInput: "#21222c",
  surfaceOverlay: "#1d1e24",
  surfaceValue: "#202126",
  surfaceScrim: "rgba(7, 7, 9, 0.72)",
  surfaceTabRail: "rgba(18, 19, 23, 0.82)",

  // Content
  contentPrimary: "#f8f8f2",
  contentSecondary: "#9da1ad",
  contentMuted: "#858995",
  contentDisabled: "#747985",
  contentAccent: "#c94f74",
  contentAccentStrong: "#cf1750",
  contentObject: "#81d3f9",
  contentSearchMatch: "rgb(163, 127, 96)",

  // Borders
  borderSubtle: "rgba(255, 255, 255, 0.04)",
  borderDefault: "rgba(255, 255, 255, 0.13)",
  borderStrong: "#3d414d",
  borderAccent: "rgba(201, 79, 116, 0.42)",
  borderAccentStrong: "rgba(201, 79, 116, 0.52)",

  // Interaction and controls
  interactionNeutral: "#32343e",
  interactionNeutralHover: "#292b35",
  interactionHover: "#ffffff0e",
  interactionAccentHover: "rgba(201, 79, 116, 0.08)",
  interactionAccentActive: "rgba(201, 79, 116, 0.15)",
  interactionGuide: "#6272a4",
  scrollbarThumb: "rgba(255, 255, 255, 0.13)",
  controlSurface: "#262833",
  controlSurfaceHover: "#32343e",
  controlTrack: "#262833",
  controlKnob: "#f8f8f2",

  // Actions and status
  actionPrimary: "#b81447",
  actionPrimaryHover: "#cf1750",
  statusDanger: "#ff6b73",
  statusDangerStrong: "#fa4d56",
  statusDangerMuted: "rgba(220, 40, 40, 0.72)",
  statusDangerSurface: "rgba(220, 40, 40, 0.3)",
  statusDangerSurfaceHover: "rgba(220, 40, 40, 0.4)",
  statusDangerBorder: "rgba(255, 107, 115, 0.24)",
  statusSuccess: "#66bb6a",
  statusSuccessStrong: "#188a5d",
  statusSuccessSurface: "rgba(102, 187, 106, 0.12)",
  statusSuccessBorder: "rgba(102, 187, 106, 0.24)",
  statusWarning: "#ffd54f",
  statusWarningSurface: "rgba(255, 213, 79, 0.10)",
  statusWarningSurfaceHover: "rgba(255, 213, 79, 0.16)",
  statusAttention: "#e3ce78",
  statusInfo: "#81d3f9",
  statusInfoSurface: "rgba(129, 211, 249, 0.1)",
  statusFeature: "#a99de8",

  // Shadows
  shadowSubtle: "rgba(0, 0, 0, 0.08)",
  shadowSoft: "rgba(0, 0, 0, 0.16)",
  shadowMedium: "rgba(0, 0, 0, 0.28)",
  shadowStrong: "rgba(0, 0, 0, 0.42)",
  shadowOverlay: "rgba(0, 0, 0, 0.58)",

  // Liquid glass
  glassSurface: "rgba(255, 255, 255, 0.075)",
  glassBorder: "rgba(255, 255, 255, 0.14)",
  glassEdge: "rgba(255, 255, 255, 0.22)",

  // Brand
  brandGradientStart: "#e51a59",
  brandGradientEnd: "#8a0f35",
  aiGradientStart: "#d14671",
  aiGradientEnd: "#892c6c",

  // Result grid
  gridRow: "#17181d",
  gridHeader: "#202126",
  gridSelection: "#2b1d25",
  gridFocus: "#b81447",

  // Editor
  editorCanvas: "#17181d",
  editorBorder: "#121317",
  editorSelection: "#44475a",
  editorSelectionAccent: "#44475a",
  editorActiveLine: "#ffffff08",
  editorActiveLineBorder: "#00000000",
  editorSuggestionMatchActive: "#ff9abb",
  editorRun: "#ffffff",
  editorSyntaxString: "#f1fa8c",
  editorSyntaxNumber: "#50fa7b",
  editorSyntaxKeyword: "#ff79c6",
  editorSyntaxType: "#8be9fd",
  editorSyntaxConstant: "#bd93f9",
  editorSyntaxVariable: "#ffb86c",
  editorErrorHighlight: "rgba(255, 85, 85, 0.15)",
  editorSuccessHighlight: "rgba(80, 250, 123, 0.15)",
  editorSearchHighlight: "rgba(255, 184, 108, 0.5)",
  editorAiHighlight: "rgba(241, 250, 140, 0.5)",

  // Data visualization
  dataGrid: "rgba(157, 161, 173, 0.11)",
  dataArea: "rgba(255, 255, 255, 0.012)",
  dataSeries1: "#ff6b6b",
  dataSeries2: "#4ecdc4",
  dataSeries3: "#ffd93d",
  dataSeries4: "#95d86e",
  dataSeries5: "#ff8f40",
  dataSeries6: "#bd93f9",
  dataSeries7: "#50fa7b",
  dataSeries8: "#ff79c6",
  dataSeries9: "#8be9fd",
  dataSeries10: "#f1fa8c",
  chartSeries1: "#8be9fd",
  chartSeries2: "#d14671",
  chartSeries3: "#ffb86c",
  chartSeries4: "#bd93f9",
  chartSeries5: "#f1fa8c",
  chartSeries6: "#ff79c6",
  chartSeries7: "#50fa7b",
  chartSeries8: "#ff5555",
  dataPositive: "#2ca875",
  dataNegative: "#d94d58",

  // Authentication
  authBackdrop: "#1D070E",
  authAccent: "#9089fc",
  authAccentMuted: "rgba(144, 137, 252, 0.64)",
  authBorder: "#353946",
  authVersionContent: "#f5f3f0",
}

/**
 * Light mode preserves the same spatial story as dark mode: stages recede,
 * stationary chrome forms the base, and controls or overlays rise above it.
 */
export const lightColors: ColorShape = {
  ...invariantColors,

  // Onboarding experience: existing light-palette surface and status values.
  onboardingSurface: "#e3e5e9",
  onboardingDivider: "rgba(28, 32, 41, 0.07)",
  onboardingClose: "#565f6e",
  onboardingCommand: "#fbfcfd",
  onboardingInput: "#eceef1",
  onboardingPrompt: "#6553aa",
  onboardingAccent: "#176f87",

  // Surfaces
  surfaceCanvas: "#d9dce2",
  surfaceStage: "#c9cdd4",
  surfaceBase: "#e3e5e9",
  surfaceInset: "#eceef1",
  surfaceRaised: "#e8eaee",
  surfaceInput: "#f2f3f5",
  surfaceOverlay: "#f2f3f5",
  surfaceValue: "#fbfcfd",
  surfaceScrim: "rgba(27, 31, 39, 0.38)",
  surfaceTabRail: "rgba(218, 221, 227, 0.94)",

  // Content
  contentPrimary: "#1c2029",
  contentSecondary: "#505968",
  contentMuted: "#565f6e",
  contentDisabled: "#596271",
  contentAccent: "#b81447",
  contentAccentStrong: "#8a0f35",
  contentObject: "#b81447",
  contentSearchMatch: "rgba(202, 139, 44, 0.32)",

  // Borders
  borderSubtle: "rgba(28, 32, 41, 0.07)",
  borderDefault: "rgba(28, 32, 41, 0.15)",
  borderStrong: "#828b99",
  borderAccent: "rgba(184, 20, 71, 0.42)",
  borderAccentStrong: "rgba(184, 20, 71, 0.56)",

  // Interaction and controls
  interactionNeutral: "#d9dce2",
  interactionNeutralHover: "#d2d6dd",
  interactionHover: "#1c202913",
  interactionAccentHover: "rgba(184, 20, 71, 0.07)",
  interactionAccentActive: "rgba(184, 20, 71, 0.13)",
  interactionGuide: "#56657f",
  scrollbarThumb: "#62656b",
  controlSurface: "#f6f7f8",
  controlSurfaceHover: "#e7e9ed",
  controlTrack: "#d9dce2",
  controlKnob: "#505968",

  // Actions and status
  actionPrimary: "#8a0f35",
  actionPrimaryHover: "#b81447",
  statusDanger: "#bd2838",
  statusDangerStrong: "#a81f2e",
  statusDangerMuted: "rgba(189, 40, 56, 0.72)",
  statusDangerSurface: "rgba(189, 40, 56, 0.12)",
  statusDangerSurfaceHover: "rgba(189, 40, 56, 0.18)",
  statusDangerBorder: "rgba(189, 40, 56, 0.28)",
  statusSuccess: "#067047",
  statusSuccessStrong: "#05603e",
  statusSuccessSurface: "rgba(8, 122, 80, 0.1)",
  statusSuccessBorder: "rgba(8, 122, 80, 0.28)",
  statusWarning: "#8a570f",
  statusWarningSurface: "rgba(145, 82, 15, 0.14)",
  statusWarningSurfaceHover: "rgba(145, 82, 15, 0.2)",
  statusAttention: "#745c00",
  statusInfo: "#176f87",
  statusInfoSurface: "rgba(23, 111, 135, 0.1)",
  statusFeature: "#6553aa",

  // Shadows
  shadowSubtle: "rgba(27, 31, 39, 0.06)",
  shadowSoft: "rgba(27, 31, 39, 0.11)",
  shadowMedium: "rgba(27, 31, 39, 0.18)",
  shadowStrong: "rgba(27, 31, 39, 0.27)",
  shadowOverlay: "rgba(27, 31, 39, 0.38)",

  // Liquid glass
  glassSurface: "rgba(255, 255, 255, 0.58)",
  glassBorder: "rgba(28, 32, 41, 0.14)",
  glassEdge: "rgba(28, 32, 41, 0.22)",

  // Brand
  brandGradientStart: "#b81447",
  brandGradientEnd: "#5c0a24",
  aiGradientStart: "#a92352",
  aiGradientEnd: "#76184c",

  // Result grid
  gridRow: "#e9ebef",
  gridHeader: "#dce0e6",
  gridSelection: "#e0afbf",
  gridFocus: "#8a0f35",

  // Editor
  editorCanvas: "#d9dce2",
  editorBorder: "#c9cdd4",
  editorSelection: "#aec8ec",
  editorSelectionAccent: "#7a99c4",
  editorActiveLine: "#1c202909",
  editorActiveLineBorder: "#1c202900",
  editorSuggestionMatchActive: "#8a0f35",
  editorRun: "#067047",
  editorSyntaxString: "#695f00",
  editorSyntaxNumber: "#056c45",
  editorSyntaxKeyword: "#b81447",
  editorSyntaxType: "#0a6a80",
  editorSyntaxConstant: "#6553aa",
  editorSyntaxVariable: "#8e500a",
  editorErrorHighlight: "rgba(189, 40, 56, 0.13)",
  editorSuccessHighlight: "rgba(8, 122, 80, 0.13)",
  editorSearchHighlight: "rgba(202, 139, 44, 0.32)",
  editorAiHighlight: "rgba(180, 154, 33, 0.28)",

  // Data visualization
  dataGrid: "rgba(80, 89, 104, 0.16)",
  dataArea: "rgba(28, 32, 41, 0.018)",
  dataSeries1: "#d51515",
  dataSeries2: "#0c7966",
  dataSeries3: "#80690d",
  dataSeries4: "#357b0c",
  dataSeries5: "#ac5111",
  dataSeries6: "#6415d5",
  dataSeries7: "#0c7b37",
  dataSeries8: "#cc147e",
  dataSeries9: "#1072a5",
  dataSeries10: "#61740b",
  chartSeries1: "#1590aa",
  chartSeries2: "#e42560",
  chartSeries3: "#c16f18",
  chartSeries4: "#7425e4",
  chartSeries5: "#728d11",
  chartSeries6: "#e425ac",
  chartSeries7: "#139842",
  chartSeries8: "#e42525",
  dataPositive: "#05603e",
  dataNegative: "#a81f2e",

  // Authentication
  authBackdrop: "#c7cbd2",
  authAccent: "#7d2948",
  authAccentMuted: "rgba(68, 75, 88, 0.46)",
  authBorder: "#a8b0bd",
  authVersionContent: "#e7e3e5",
}

const fontSize: FontSizeShape = {
  ms: "1rem",
  xs: "1.2rem",
  sm: "1.3rem",
  md: "1.4rem",
  lg: "1.5rem",
  xl: "1.7rem",
  hg: "3rem",
}

/**
 * Derive translucent renderer colors from semantic opaque roles. Keeping the
 * alpha at the consumer avoids multiplying theme tokens for every opacity.
 */
export const withAlpha = (value: string, alpha: number): string => {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha))
  const alphaHex = Math.round(normalizedAlpha * 255)
    .toString(16)
    .padStart(2, "0")

  const shortHex = value.match(/^#([\da-f]{3,4})$/i)
  if (shortHex) {
    const rgb = shortHex[1]
      .slice(0, 3)
      .split("")
      .map((channel) => channel.repeat(2))
      .join("")
    return `#${rgb}${alphaHex}`
  }

  const longHex = value.match(/^#([\da-f]{6})(?:[\da-f]{2})?$/i)
  if (longHex) {
    return `#${longHex[1]}${alphaHex}`
  }

  const channel = String.raw`-?(?:\d+(?:\.\d*)?|\.\d+)%?`
  const commaRgb = value.match(
    new RegExp(
      String.raw`^rgba?\(\s*(${channel})\s*,\s*(${channel})\s*,\s*(${channel})(?:\s*,\s*${channel})?\s*\)$`,
      "i",
    ),
  )
  if (commaRgb) {
    return `rgba(${commaRgb[1]}, ${commaRgb[2]}, ${commaRgb[3]}, ${normalizedAlpha})`
  }

  const spaceRgb = value.match(
    new RegExp(
      String.raw`^rgba?\(\s*(${channel})\s+(${channel})\s+(${channel})(?:\s*\/\s*${channel})?\s*\)$`,
      "i",
    ),
  )
  if (spaceRgb) {
    return `rgba(${spaceRgb[1]}, ${spaceRgb[2]}, ${spaceRgb[3]}, ${normalizedAlpha})`
  }

  return value
}

export const createTheme = (
  color: ColorShape,
  mode: ThemeMode,
): DefaultThemeShape => ({
  mode,
  baseFontSize: "10px",
  color,
  font: '"Open Sans", -apple-system, BlinkMacSystemFont, Helvetica, Roboto, sans-serif',

  fontEmoji:
    '"apple color emoji", "segoe ui emoji", "android emoji", "emojisymbols", "emojione mozilla", "twemoji mozilla", "segoe ui symbol", "noto color emoji"',
  fontMonospace:
    'SFMono-Regular, Menlo, Monaco, Consolas,"Liberation Mono", "Courier New", monospace',
  fontSize,
  borderRadius: "0.6rem",
})

export const darkTheme = createTheme(darkColors, "dark")
export const lightTheme = createTheme(lightColors, "light")
export const theme = darkTheme

export const brandLinearGradientHorizontal = (color: ColorShape) =>
  `linear-gradient(90deg, ${color.brandGradientStart} 0%, ${color.brandGradientEnd} 100%)`
export const brandLinearGradientVertical = (color: ColorShape) =>
  `linear-gradient(180deg, ${color.brandGradientStart} 0%, ${color.brandGradientEnd} 100%)`

export type ThemeShape = typeof theme
