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
import {
    SecondaryButton,
} from "../../../components"

import { useSelector } from "react-redux"
import { selectors } from "../../../store"

type Props = Readonly<{
  onClick?: (event: MouseEvent) => void,
  children: ReactNode
}>

const Button = styled(SecondaryButton)`
  margin-left: 1rem;
  width: 7rem !important;
  height: 2rem !important;
  color: white;
`

export const RetryButton = ({
  children,
  onClick
}: Props) => {
  const running = useSelector(selectors.query.getRunning)

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={running.value}
      fontSize="ms"
    >
        {children}
    </Button>
  )
}