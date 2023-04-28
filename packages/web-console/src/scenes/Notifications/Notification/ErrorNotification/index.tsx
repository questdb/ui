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

import React, { useCallback } from "react"
import styled from "styled-components"
import { format } from "date-fns/fp"
import { Wrapper, Content, SideContent } from "../styles"
import { Timestamp } from "../Timestamp"
import { NotificationShape } from "../../../../types"
import { CloseOutline } from "styled-icons/evaicons-outline"
import { Copy } from "styled-icons/evaicons-solid/"
import { color, copyToClipboard } from "../../../../utils"
import { PopperHover, Tooltip } from "../../../../components"

const CloseOutlineIcon = styled(CloseOutline)`
  color: ${color("draculaRed")};
  flex-shrink: 0;
`

const CopyIcon = styled(Copy)`
  flex-shrink: 0;
  margin-right: 0.5rem;
`

export const ErrorNotification = (props: NotificationShape) => {
  const { createdAt, content, sideContent, request, result } = props
  const handleCopyToClipboard = useCallback(() => {
    let clipboardText = `[${format("HH:mm:ss", createdAt)}] ${request?.query}\n`
    clipboardText += `✖ Error: ${result?.error || 'Unknown Error'}`;
    copyToClipboard(clipboardText.trim())
  }, [createdAt, request, result])

  return (
    <Wrapper onClick={handleCopyToClipboard}>
      <PopperHover delay={350} placement="right" trigger={<CopyIcon size="20px" />}>
        <Tooltip>{"Click to copy"}</Tooltip>
      </PopperHover>
      <Timestamp createdAt={createdAt} />
      <CloseOutlineIcon size="18px" />
      <Content>{content}</Content>
      <SideContent>{sideContent}</SideContent>
    </Wrapper>
  )
}
