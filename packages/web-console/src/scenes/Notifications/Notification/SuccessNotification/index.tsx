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
import { Wrapper, SideContent, Content } from "../styles"
import { NotificationShape } from "../../../../types"
import { CheckmarkOutline } from "@styled-icons/evaicons-outline"
import { Zap } from "@styled-icons/boxicons-solid"
import { color } from "../../../../utils"
import { Timestamp } from "../Timestamp"
import { IconWithTooltip } from "../../../../components"

const CheckmarkOutlineIcon = styled(CheckmarkOutline)`
  color: ${color("green")};
  flex-shrink: 0;
`

const ZapIcon = styled(Zap)`
  color: ${color("yellow")};
  flex-shrink: 0;
`

export const SuccessNotification = (props: NotificationShape) => {
  const { createdAt, content, sideContent, jitCompiled, isMinimized } = props
  return (
    <Wrapper isMinimized={isMinimized} data-hook="success-notification">
      <Timestamp createdAt={createdAt} />
      {jitCompiled ? (
        <IconWithTooltip
          icon={<ZapIcon size="16px" />}
          placement="top"
          tooltip="JIT Compiled"
        />
      ) : (
        <CheckmarkOutlineIcon size="18px" />
      )}
      <Content>{content}</Content>
      <SideContent>{sideContent}</SideContent>
    </Wrapper>
  )
}
