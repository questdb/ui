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

import type { ColorShape, FontSizeShape } from "types"

const color: ColorShape = {
  black: "#191a21",
  black70: "rgba(25, 26, 33, 0.7)",
  black40: "rgba(25, 26, 33, 0.4)",
  black20: "rgba(25, 26, 33, 0.2)",
  gray1: "#585858",
  gray2: "#bbbbbb",
  backgroundDarker: "#21222c",
  backgroundLighter: "#282a36",
  background: "#21222c",
  foreground: "#f8f8f2",
  selection: "#44475a",
  selectionDarker: "#333544",
  comment: "#6272a4",
  red: "#ff5555",
  redDark: "#5a1d1d",
  orange: "#ffb86c",
  yellow: "#f1fa8c",
  green: "#50fa7b",
  greenDarker: "#00aa3b",
  purple: "#bd93f9",
  cyan: "#8be9fd",
  pink: "#d14671",
  pink50: "rgba(209, 70, 113, 0.25)",
  pinkDarker: "#be2f5b",
  pinkLighter: "#ff79c6",
  transparent: "transparent",
  white: "#fafafa",
  inherit: "inherit",
  tooltipBackground: "#6272a4",
  tableSelection: "#043c5c",
  graphLegend: "#6e7078",
  offWhite: "#bdbdbd",
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

export const theme: DefaultThemeShape = {
  baseFontSize: "10px",
  color,
  font: '"Open Sans", -apple-system, BlinkMacSystemFont, Helvetica, Roboto, sans-serif',

  fontEmoji:
    '"apple color emoji", "segoe ui emoji", "android emoji", "emojisymbols", "emojione mozilla", "twemoji mozilla", "segoe ui symbol", "noto color emoji"',
  fontMonospace:
    'SFMono-Regular, Menlo, Monaco, Consolas,"Liberation Mono", "Courier New", monospace',
  fontSize,
  borderRadius: "0.8rem",
}

export type ThemeShape = typeof theme
