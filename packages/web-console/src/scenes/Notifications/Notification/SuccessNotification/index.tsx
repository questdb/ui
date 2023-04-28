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

import React, { useCallback, useMemo } from "react"
import styled from "styled-components"
import { format } from "date-fns/fp"
import { Wrapper, SideContent, Content } from "../styles"
import { NotificationShape } from "../../../../types"
import { CheckmarkOutline } from "styled-icons/evaicons-outline"
import { Zap } from "styled-icons/boxicons-solid"
import { Copy } from "styled-icons/evaicons-solid/"
import { color, copyToClipboard, formatTiming, renderTable } from "../../../../utils"
import { Timestamp } from "../Timestamp"
import {
  IconWithTooltip,
  PopperHover,
  Tooltip
} from "../../../../components"

const CheckmarkOutlineIcon = styled(CheckmarkOutline)`
  color: ${color("draculaGreen")};
  flex-shrink: 0;
`

const ZapIcon = styled(Zap)`
  color: ${color("draculaYellow")};
`

const CopyIcon = styled(Copy)`
  flex-shrink: 0;
  margin-right: 0.5rem;
`

export const SuccessNotification = (props: NotificationShape) => {
  const { createdAt, content, sideContent, jitCompiled, request, result } = props
  const handleCopyToClipboard = useCallback(() => {
    let clipboardText = `[${format("HH:mm:ss", createdAt)}] ${request?.query}\n`
    if (result?.timings) {
      try {
        const { count, compiler, fetch, execute } = result.timings;
        clipboardText += `✔ Success: ${result.count?.toLocaleString()} rows in ${formatTiming(fetch)}\n`;
        clipboardText += renderTable([
          ['Execute', 'Network', 'Total', 'Count', 'Compile'],
          [
            formatTiming(execute),
            formatTiming(fetch - execute),
            formatTiming(fetch),
            formatTiming(count),
            formatTiming(compiler),
          ],
        ])
      } catch (error) {
        console.error('Error building table to copy:', error)
      }
    }
    copyToClipboard(clipboardText.trim())
  }, [createdAt, request, result])

  const icon = useMemo(() => {
    return jitCompiled ? (
      <IconWithTooltip
        icon={<ZapIcon size="16px" />}
        placement="top"
        tooltip="JIT Compiled"
      />
    ) : (
      <CheckmarkOutlineIcon size="18px" />
    )
  }, [jitCompiled])

  return (
    <Wrapper onClick={handleCopyToClipboard}>
      <PopperHover delay={350} placement="right" trigger={<CopyIcon size="20px" />}>
        <Tooltip>{"Click to copy"}</Tooltip>
      </PopperHover>
      <Timestamp createdAt={createdAt} />
      {icon}
      <Content>{content}</Content>
      <SideContent>{sideContent}</SideContent>
    </Wrapper>
  )
}
