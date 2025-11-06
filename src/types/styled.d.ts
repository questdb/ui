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
  black: string
  black70: string
  black40: string
  black20: string
  gray1: string
  gray2: string
  backgroundLighter: string
  backgroundDarker: string
  background: string
  foreground: string
  selection: string
  selectionDarker: string
  comment: string
  red: string
  redDark: string
  orangeDark: string
  orange: string
  yellow: string
  green: string
  greenDarker: string
  purple: string
  cyan: string
  pink: string
  pink50: string
  pinkPrimary: string
  pinkDarker: string
  pinkLighter: string
  transparent: string
  white: string
  inherit: string
  tooltipBackground: string
  tableSelection: string
  graphLegend: string
  offWhite: string
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

export type FontSize = keyof FontSizeShape

declare module "styled-components" {
  interface DefaultTheme {
    baseFontSize: string
    color: ColorShape
    font: string
    fontEmoji: string
    fontMonospace: string
    fontSize: FontSizeShape
    borderRadius: string
  }
}
