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

import styled from "styled-components"
import { NotificationShape } from "types"
import { bezierTransition } from "../../../components"

export const Wrapper = styled.div<{
  isMinimized: NotificationShape["isMinimized"]
}>`
  display: flex;
  align-items: center;
  border-right: none;
  height: ${({ isMinimized }) => (isMinimized ? "auto" : "4.5rem")};
  border-bottom: ${({ isMinimized, theme }) =>
    isMinimized ? "none" : `1px solid ${theme.color.backgroundDarker}`};
  padding: 0 1rem;
  flex-shrink: 0;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }

  ${bezierTransition};
`

export const Content = styled.div`
  display: flex;
  margin-left: 0.5rem;
  white-space: nowrap;
`

export const SideContent = styled.div`
  padding-left: 1rem;
  text-overflow: ellipsis;
`
