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

import React, { useMemo } from "react"
import styled from "styled-components"
import { Text } from "../../../../components"
import { format, Locale } from "date-fns"
import { enUS, fr, es, de, ja, ko, zhCN } from "date-fns/locale"

type Props = {
  createdAt: Date
}

function localeFromLanguage(language: string) {
  const localeMap: { [key: string]: Locale } = {
    "en-US": enUS, // English (United States)
    "fr-FR": fr, // French (France)
    "es-ES": es, // Spanish (Spain)
    "de-DE": de, // German (Germany)
    "ja-JP": ja, // Japanese (Japan)
    "ko-KR": ko, // Korean (South Korea),
    "zh-CN": zhCN, // Chinese (Simplified, China)
  }

  // If the language is not found in the map, default to English (United States)
  return localeMap[language] || enUS
}

const TimestampText = styled(Text)`
  display: flex;
  margin-right: 0.5rem;
`

export const Timestamp = ({ createdAt }: Props) => {
  const userLocale = useMemo(() => {
    return navigator.languages && navigator.languages.length
      ? navigator.languages[0]
      : navigator.language
  }, [])

  return (
    <TimestampText color="gray2">
      [{format(createdAt, "pppp", { locale: localeFromLanguage(userLocale) })}]
    </TimestampText>
  )
}
