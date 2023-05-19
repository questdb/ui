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
import React, { ReactNode, MouseEvent } from "react"
import styled from "styled-components"
import { Stop } from "styled-icons/remix-line"
import {
    PrimaryButton,
} from "../../../components"
import { color } from "../../../utils"

import { useSelector } from "react-redux"
import { selectors } from "../../../store"

type Props = Readonly<{
  onRetry: (event?: MouseEvent) => void,
  onCancel: (event?: MouseEvent) => void,
  children: ReactNode
}>

type RetryButtonProps = Readonly<{
  isRunning: boolean,
  onClick: (event?: MouseEvent) => void,
  children: ReactNode
}>

const RetryButtonStyled = styled(PrimaryButton)<RetryButtonProps>`
  margin-left: 1rem;
  width: 18rem !important;
  height: 2rem !important;
  background: "selection";
  border: "selection";
  color: ${props => props.isRunning ? color("red") : color("green")};
`

export const RetryButton = ({
  children,
  onRetry,
  onCancel
}: Props) => {
  const {value: isRunning} = useSelector(selectors.query.getRunning)
  const onClick = isRunning ? onCancel : onRetry

  return (
    <RetryButtonStyled
      type="button"
      onClick={onClick}
      fontSize="ms"
      isRunning={isRunning}
    >
      { isRunning ? <Stop size={16}/> : children }
    </RetryButtonStyled>
  )
}