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
import { Wrapper, Content, SideContent } from "../styles"
import { Timestamp } from "../Timestamp"
import { NotificationShape } from "../../../../types"
import { InfoOutline } from "@styled-icons/evaicons-outline"
import { color } from "../../../../utils"

const InfoOutlineIcon = styled(InfoOutline)`
  color: ${color("yellow")};
  flex-shrink: 0;
`

export const NoticeNotification = (props: NotificationShape) => {
  const { createdAt, content, sideContent, isMinimized } = props
  return (
    <Wrapper isMinimized={isMinimized} data-hook="notice-notification">
      <Timestamp createdAt={createdAt} />
      <InfoOutlineIcon size="18px" />
      <Content>{content}</Content>
      <SideContent>{sideContent}</SideContent>
    </Wrapper>
  )
}
