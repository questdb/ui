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

import { MAX_COLUMN_WIDTH_BOUNDS } from "../../components/ResultGrid/dimensions"
import type { MaxColumnWidth } from "../../components/ResultGrid/types"

export const parseBoolean = (value: string, defaultValue: boolean): boolean =>
  value ? value === "true" : defaultValue

export const parseInteger = (value: string, defaultValue: number): number =>
  isNaN(parseInt(value)) ? defaultValue : parseInt(value)

export const parseMaxColumnWidth = (value: string): MaxColumnWidth => {
  const parsed = parseInt(value)
  if (isNaN(parsed)) return "auto"
  return Math.min(
    Math.max(parsed, MAX_COLUMN_WIDTH_BOUNDS.min),
    MAX_COLUMN_WIDTH_BOUNDS.max,
  )
}

export const isMaxColumnWidthDraftValid = (draft: string): boolean => {
  if (draft === "") return true
  if (!/^\d+$/.test(draft)) return false
  const width = parseInt(draft)
  return (
    width >= MAX_COLUMN_WIDTH_BOUNDS.min && width <= MAX_COLUMN_WIDTH_BOUNDS.max
  )
}
