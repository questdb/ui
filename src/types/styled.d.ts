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

import "styled-components"

export type ColorShape = {
  surfaceCanvas: string
  surfaceStage: string
  surfaceBase: string
  surfaceInset: string
  surfaceRaised: string
  surfaceInput: string
  surfaceOverlay: string
  surfaceValue: string
  surfaceScrim: string
  surfaceTabRail: string
  transparent: string
  contentPrimary: string
  contentSecondary: string
  contentMuted: string
  contentDisabled: string
  contentInverse: string
  contentOnWarning: string
  neutralInk: string
  contentAccent: string
  contentAccentStrong: string
  contentObject: string
  contentSearchMatch: string
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  borderAccent: string
  borderAccentStrong: string
  interactionNeutral: string
  interactionNeutralHover: string
  interactionHover: string
  interactionAccentHover: string
  interactionAccentActive: string
  interactionGuide: string
  scrollbarThumb: string
  controlSurface: string
  controlSurfaceHover: string
  controlTrack: string
  controlKnob: string
  actionPrimary: string
  actionPrimaryHover: string
  statusDanger: string
  statusDangerStrong: string
  statusDangerMuted: string
  statusDangerSurface: string
  statusDangerSurfaceHover: string
  statusDangerBorder: string
  statusSuccess: string
  statusSuccessStrong: string
  statusSuccessSurface: string
  statusSuccessBorder: string
  statusWarning: string
  statusWarningSurface: string
  statusWarningSurfaceHover: string
  statusAttention: string
  statusInfo: string
  statusInfoSurface: string
  statusFeature: string
  statusAssistant: string
  statusAssistantStrong: string
  shadowSubtle: string
  shadowSoft: string
  shadowMedium: string
  shadowStrong: string
  shadowOverlay: string
  glassSurface: string
  glassBorder: string
  glassEdge: string
  brandGradientStart: string
  brandGradientEnd: string
  aiGradientStart: string
  aiGradientEnd: string
  gridRow: string
  gridHeader: string
  gridSelection: string
  gridFocus: string
  editorCanvas: string
  editorBorder: string
  editorSelection: string
  editorSelectionAccent: string
  editorActiveLine: string
  editorActiveLineBorder: string
  editorSuggestionMatchActive: string
  editorRun: string
  editorSyntaxString: string
  editorSyntaxNumber: string
  editorSyntaxKeyword: string
  editorSyntaxType: string
  editorSyntaxConstant: string
  editorSyntaxVariable: string
  editorErrorHighlight: string
  editorSuccessHighlight: string
  editorSearchHighlight: string
  editorAiHighlight: string
  dataGrid: string
  dataArea: string
  dataSeries1: string
  dataSeries2: string
  dataSeries3: string
  dataSeries4: string
  dataSeries5: string
  dataSeries6: string
  dataSeries7: string
  dataSeries8: string
  dataSeries9: string
  dataSeries10: string
  chartSeries1: string
  chartSeries2: string
  chartSeries3: string
  chartSeries4: string
  chartSeries5: string
  chartSeries6: string
  chartSeries7: string
  chartSeries8: string
  dataPositive: string
  dataNegative: string
  authBackdrop: string
  authAccent: string
  authAccentMuted: string
  authBorder: string
  authVersionContent: string
  onboardingSurface: string
  onboardingDivider: string
  onboardingClose: string
  onboardingCommand: string
  onboardingInput: string
  onboardingPrompt: string
  onboardingAccent: string
  instancePreset1: string
  instancePreset2: string
  instancePreset3: string
  windowControlClose: string
  windowControlMinimize: string
  windowControlExpand: string
  pickerHue0: string
  pickerHue1: string
  pickerHue2: string
  pickerHue3: string
  pickerHue4: string
  pickerHue5: string
}

export type FontSizeShape = {
  ms: string
  xs: string
  sm: string
  md: string
  lg: string
  xl: string
  hg: string
}

export type Color = keyof ColorShape

export type ThemeMode = "dark" | "light"

export type ThemePreference = ThemeMode | "system"

export type FontSize = keyof FontSizeShape

declare module "styled-components" {
  interface DefaultTheme {
    mode: ThemeMode
    baseFontSize: string
    color: ColorShape
    font: string
    fontEmoji: string
    fontMonospace: string
    fontSize: FontSizeShape
    borderRadius: string
  }
}
