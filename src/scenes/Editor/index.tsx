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

import React, { CSSProperties, forwardRef, Ref, useEffect, useRef } from "react"
import styled from "styled-components"

import { PaneWrapper } from "../../components"

import Monaco from "./Monaco"
import { Tabs } from "./Monaco/tabs"
import { useEditor } from "../../providers/EditorProvider"
import { Metrics } from "./Metrics"
import Notifications from "../../scenes/Notifications"
import type { QueryKey } from "../../store/Query/types"
import type { ErrorResult } from "../../utils"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

type Props = Readonly<{
  style?: CSSProperties
}>

// Buffer ID -> QueryKey -> Execution State
export type ExecutionRefs = Record<string, Record<QueryKey, { 
  error?: ErrorResult, 
  success?: boolean,
  selection?: { startOffset: number, endOffset: number },
  queryText: string,
  startOffset: number
  endOffset: number
}>>

const EditorPaneWrapper = styled(PaneWrapper)`
  height: 100%;
  overflow: hidden;
`

const Editor = ({
  innerRef,
  ...rest
}: Props & { innerRef: Ref<HTMLDivElement> }) => {
  const dispatch = useDispatch()
  const { activeBuffer, addBuffer } = useEditor()
  const executionRefs = useRef<ExecutionRefs>({})

  const handleClearNotifications = (bufferId: number) => {
    dispatch(actions.query.cleanupBufferNotifications(bufferId))
    delete executionRefs.current[bufferId]
  }
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get("query")
    if (query && activeBuffer.metricsViewState) {
      addBuffer({ label: "Query" })
    }
  }, [])

  return (
    <EditorPaneWrapper ref={innerRef} {...rest}>
      <Tabs />
      {activeBuffer.editorViewState && <Monaco executionRefs={executionRefs} />}
      {activeBuffer.metricsViewState && <Metrics key={activeBuffer.id} />}
      {activeBuffer.editorViewState && <Notifications onClearNotifications={handleClearNotifications} />}
    </EditorPaneWrapper>
  )
}

const EditorWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <Editor {...props} innerRef={ref} />
)

export default forwardRef(EditorWithRef)
