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

import { Text } from "../../components/Text"

export const Root = styled.div<{ shadow?: boolean; $titleColor?: string }>`
  position: relative;
  display: flex;
  justify-content: space-between;
  height: 5.2rem;
  min-height: 5.2rem;
  padding: 0 1.4rem;
  align-items: center;
  background: ${({ $titleColor, theme }) =>
    $titleColor ?? theme.color.surfaceRaised};
  z-index: 5;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};

  ${({ shadow, theme }) =>
    shadow &&
    `
      box-shadow: 0 2px 10px 0 ${theme.color.shadowStrong}
  `}
`

const Title = styled(Text)`
  display: flex;
  align-items: center;
  padding-left: 1rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const Header = ({
  title,
  afterTitle,
  shadow,
  titleColor,
}: {
  title?: React.ReactNode
  afterTitle?: React.ReactNode
  shadow?: boolean
  titleColor?: string
}) => (
  <Root shadow={shadow} $titleColor={titleColor}>
    {title && typeof title === "string" ? (
      <Title color="contentPrimary" ellipsis>
        {title}
      </Title>
    ) : (
      title
    )}
    {afterTitle}
  </Root>
)
