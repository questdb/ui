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

import { css, keyframes } from "styled-components"
import { color } from "../../utils/styled"

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
`

export const spinAnimation = css`
  animation: ${spin} 1.5s cubic-bezier(0.62, 0.28, 0.23, 0.99) infinite;
`

export const slideAnimation = css`
  @keyframes slide {
    0% {
      background-position: 200% center;
    }
    100% {
      background-position: -200% center;
    }
  }

  background: linear-gradient(
    90deg,
    ${color("gray2")} 0%,
    ${color("gray2")} 40%,
    ${color("white")} 50%,
    ${color("gray2")} 60%,
    ${color("gray2")} 100%
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-fill-color: transparent;
  animation: slide 3s linear infinite;
`
