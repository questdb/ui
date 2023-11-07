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

import React from "react"
import styled from "styled-components"

import { color } from "../../utils"
import { Text } from "../../components/Text"

export const Root = styled.div<{ shadow?: boolean }>`
  position: relative;
  display: flex;
  justify-content: space-between;
  height: 4.5rem;
  padding: 0 1rem;
  align-items: center;
  background: ${color("backgroundLighter")};
  border-top: 1px solid transparent;
  z-index: 5;

  ${({ shadow }) =>
    shadow &&
    `
      box-shadow: 0 2px 10px 0 rgba(23, 23, 23, 0.65)
  `}
`

const Title = styled(Text)`
  display: flex;
  align-items: center;
  padding-left: 1rem;
  font-size: 1.8rem;
  font-weight: 600;
`

export const Header = ({
  title,
  afterTitle,
  shadow,
}: {
  title: React.ReactNode
  afterTitle?: React.ReactNode
  shadow?: boolean
}) => (
  <Root shadow={shadow}>
    <Title color="foreground">{title}</Title>
    {afterTitle}
  </Root>
)
