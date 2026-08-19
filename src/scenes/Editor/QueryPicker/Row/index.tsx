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
import styled, { css } from "styled-components"
import { FileCode } from "../../../../components/icons"

import { Text } from "../../../../components"
import { menuItemStyles } from "../../../../components/menuStyles"
import { color } from "../../../../utils"
import { Query } from "providers/SettingsProvider/types"

type MouseAction = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void

type Props = Readonly<{
  active: boolean
  hidePicker: () => void
  onMouseEnter: MouseAction
  onMouseLeave: MouseAction
  onClick: MouseAction
  query: Query
}>

const activeStyles = css`
  background: ${color("surfaceRaised")};
`

const Wrapper = styled.div<{ active: boolean }>`
  ${menuItemStyles}

  width: 100%;
  min-width: 0;

  ${({ active }) => active && activeStyles};
`

const Value = styled(Text)`
  flex: 1 1 auto;
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
`

const FileIcon = styled(FileCode)`
  width: 1.6rem;
  height: 1.6rem;
  flex: 0 0 1.6rem;
  color: ${color("statusWarning")};
`

const Name = styled(Text)`
  flex: 0 0 auto;
  max-width: 18rem;
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Row = ({ active, onMouseEnter, onMouseLeave, onClick, query }: Props) => (
  <Wrapper
    active={active}
    aria-selected={active}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    role="option"
  >
    <FileIcon />

    {query.name && <Name>{query.name}</Name>}

    <Value>{query.value}</Value>
  </Wrapper>
)

export default Row
