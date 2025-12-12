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

import React, {
  CSSProperties,
  forwardRef,
  Ref,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react"
import styled from "styled-components"
import { DiffEditor } from "@monaco-editor/react"

import { PaneWrapper, Box, Button, Key } from "../../components"

import Monaco from "./Monaco"
import { Tabs } from "./Monaco/tabs"
import { useEditor } from "../../providers/EditorProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { Metrics } from "./Metrics"
import Notifications from "../../scenes/Notifications"
import type { QueryKey } from "../../store/Query/types"
import type { ErrorResult } from "../../utils"
import { color, platform } from "../../utils"
import { useDispatch } from "react-redux"
import { actions } from "../../store"
import { QuestDBLanguageName, normalizeQueryText } from "./Monaco/utils"
import type { QueryKey as MonacoQueryKey } from "./Monaco/utils"

type Props = Readonly<{
  style?: CSSProperties
}>

export type ExecutionInfo = {
  error?: ErrorResult
  success?: boolean
  selection?: { startOffset: number; endOffset: number }
  queryText: string
  startOffset: number
  endOffset: number
}

// Buffer ID -> QueryKey -> Execution State
export type ExecutionRefs = Record<
  string,
  Record<
    QueryKey,
    {
      error?: ErrorResult
      success?: boolean
      selection?: { startOffset: number; endOffset: number }
      queryText: string
      startOffset: number
      endOffset: number
    }
  >
>

const EditorPaneWrapper = styled(PaneWrapper)`
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: row;

  & > div {
    height: 100%;
    width: 100%;
  }
`

const EditorLeftPane = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`

const EditorContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
`

const EditorPane = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`

const DiffViewWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #2c2e3d;
`

const DiffEditorContainer = styled.div`
  flex: 1;
  overflow: hidden;
`

const ButtonBar = styled(Box)`
  padding: 0.8rem;
  gap: 1rem;
  justify-content: center;
  flex-shrink: 0;
  width: fit-content;
  margin: 0 auto 1rem auto;
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
`

const KeyContainer = styled(Box).attrs({ alignItems: "center", gap: "0.3rem" })`
  margin-left: 1rem;
`

const RejectButton = styled(Button)`
  background: ${color("background")};
  color: ${color("foreground")};
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  flex: 1;
  &:hover:not(:disabled) {
    background: ${color("selection")};
    border-color: ${({ theme }) => theme.color.pinkDarker};
  }
  width: 13.5rem;
`

const AcceptButton = styled(Button)`
  background: ${({ theme }) => theme.color.pinkDarker};
  color: ${color("foreground")};
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  flex: 1;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pink};
    border-color: ${({ theme }) => theme.color.pink};
    filter: brightness(1.1);
  }
  width: 13.5rem;
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

const Editor = ({
  innerRef,
  ...rest
}: Props & { innerRef: Ref<HTMLDivElement> }) => {
  const dispatch = useDispatch()
  const {
    activeBuffer,
    addBuffer,
    archiveBuffer,
    buffers,
    setActiveBuffer,
    applyAISQLChange,
  } = useEditor()
  const {
    getConversation,
    acceptConversationChanges,
    rejectLatestChange,
    updateConversationQueryKey,
    updateConversationSQL,
  } = useAIConversation()
  const executionRefs = useRef<ExecutionRefs>({})

  const handleClearNotifications = (bufferId: number) => {
    dispatch(actions.query.cleanupBufferNotifications(bufferId))
    delete executionRefs.current[bufferId]
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get("query")
    if (query && activeBuffer.metricsViewState) {
      void addBuffer({ label: "Query" })
    }
  }, [])

  // Determine if Monaco editor UI should be hidden
  // Hidden when viewing diff buffer or metrics, but component stays mounted for query execution
  const isMonacoHidden =
    !!activeBuffer.isDiffBuffer || !!activeBuffer.metricsViewState

  // Check if the current diff buffer shows a pending AI suggestion
  // A diff is "pending" if:
  // 1. The diff buffer has a queryKey linking it to a conversation
  // 2. That conversation has hasPendingDiff = true
  // 3. The diff's modified content matches the conversation's currentSQL (handles multiple revisions)
  const pendingDiffInfo = useMemo(() => {
    if (!activeBuffer.isDiffBuffer || !activeBuffer.diffContent?.queryKey) {
      return null
    }

    const queryKey = activeBuffer.diffContent.queryKey as MonacoQueryKey
    const conversation = getConversation(queryKey)

    if (!conversation || !conversation.hasPendingDiff) {
      return null
    }

    // Compare normalized SQL to ensure this diff matches the current pending suggestion
    const normalizedDiffModified = normalizeQueryText(
      activeBuffer.diffContent.modified || "",
    )
    const normalizedCurrentSQL = normalizeQueryText(
      conversation.currentSQL || "",
    )

    if (normalizedDiffModified !== normalizedCurrentSQL) {
      return null
    }

    return {
      queryKey,
      conversation,
    }
  }, [activeBuffer, getConversation])

  // Handle accept button click from diff editor button bar
  const handleAcceptFromDiffEditor = useCallback(async () => {
    if (!pendingDiffInfo || !activeBuffer.diffContent) return

    const { queryKey, conversation } = pendingDiffInfo
    const modifiedSQL = activeBuffer.diffContent.modified

    // Find the original buffer to switch back to
    const originalBuffer = buffers.find(
      (b) => b.id === conversation.bufferId && !b.archived,
    )

    // Archive the diff buffer first
    if (activeBuffer.id) {
      void archiveBuffer(activeBuffer.id)
    }

    // Switch to original buffer if available
    if (originalBuffer) {
      await setActiveBuffer(originalBuffer)
      // Wait for tab switch and editor to be ready
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    // Apply the changes using the shared function
    const result = applyAISQLChange({
      newSQL: modifiedSQL,
      queryStartOffset: conversation.queryStartOffset,
      queryEndOffset: conversation.queryEndOffset,
      originalQuery: conversation.originalQuery || conversation.initialSQL,
      queryKey,
    })

    if (!result.success) {
      console.error("Failed to apply AI SQL change")
      return
    }

    // Update conversation state
    const currentExplanation = conversation.currentExplanation || ""

    if (result.finalQueryKey && result.finalQueryKey !== queryKey) {
      updateConversationQueryKey(queryKey, result.finalQueryKey)
      updateConversationSQL(
        result.finalQueryKey,
        modifiedSQL,
        currentExplanation,
      )
      acceptConversationChanges(result.finalQueryKey)
    } else {
      updateConversationSQL(queryKey, modifiedSQL, currentExplanation)
      acceptConversationChanges(queryKey)
    }
  }, [
    pendingDiffInfo,
    activeBuffer,
    buffers,
    archiveBuffer,
    setActiveBuffer,
    applyAISQLChange,
    updateConversationQueryKey,
    updateConversationSQL,
    acceptConversationChanges,
  ])

  // Handle reject button click from diff editor button bar
  const handleRejectFromDiffEditor = useCallback(() => {
    if (!pendingDiffInfo) return

    const { queryKey, conversation } = pendingDiffInfo

    // Find the original buffer to switch back to
    const originalBuffer = buffers.find(
      (b) => b.id === conversation.bufferId && !b.archived,
    )

    // Mark the latest change as rejected
    rejectLatestChange(queryKey)

    // Archive the diff buffer
    if (activeBuffer.id) {
      void archiveBuffer(activeBuffer.id)
    }

    // Switch to original buffer if available
    if (originalBuffer) {
      void setActiveBuffer(originalBuffer)
    }
  }, [
    pendingDiffInfo,
    buffers,
    rejectLatestChange,
    archiveBuffer,
    activeBuffer.id,
    setActiveBuffer,
  ])

  return (
    <EditorPaneWrapper ref={innerRef} {...rest}>
      <EditorLeftPane>
        <Tabs />
        <EditorContent>
          <EditorPane>
            {/* Monaco editor - always mounted for editor view state, but UI hidden when diff/metrics is shown */}
            {/* This ensures query execution logic stays active without mount/unmount issues */}
            {activeBuffer.editorViewState && (
              <Monaco executionRefs={executionRefs} hidden={isMonacoHidden} />
            )}
            {/* Diff view - shown for AI suggestion diff buffers */}
            {activeBuffer.isDiffBuffer && activeBuffer.diffContent && (
              <DiffViewWrapper>
                <DiffEditorContainer>
                  <DiffEditor
                    key={
                      activeBuffer.diffContent.original +
                      activeBuffer.diffContent.modified
                    }
                    onMount={(editor) => {
                      editor.onDidUpdateDiff(() => {
                        const lineChange = editor.getLineChanges()?.[0]
                        if (lineChange) {
                          editor
                            .getModifiedEditor()
                            .revealLineInCenter(
                              lineChange.modifiedStartLineNumber,
                            )
                        }
                      })
                    }}
                    original={activeBuffer.diffContent.original}
                    modified={activeBuffer.diffContent.modified}
                    language={QuestDBLanguageName}
                    theme="dracula"
                    options={{
                      readOnly: true,
                      renderSideBySide: false,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: "off",
                      renderIndicators: false,
                      renderOverviewRuler: false,
                      hideCursorInOverviewRuler: true,
                      automaticLayout: true,
                      enableSplitViewResizing: false,
                      originalEditable: false,
                      fontSize: 14,
                      lineHeight: 24,
                      folding: false,
                      wordWrap: "on",
                    }}
                  />
                </DiffEditorContainer>
                {pendingDiffInfo && (
                  <ButtonBar align="center" justifyContent="center">
                    <RejectButton onClick={handleRejectFromDiffEditor}>
                      Reject
                      <KeyContainer>
                        <Key
                          keyString="Esc"
                          color={color("pinkPrimary")}
                          hoverColor={color("pinkPrimary")}
                        />
                      </KeyContainer>
                    </RejectButton>
                    <AcceptButton onClick={handleAcceptFromDiffEditor}>
                      Accept
                      <KeyContainer>
                        <Key
                          keyString={ctrlCmd}
                          color={color("pinkPrimary")}
                          hoverColor={color("pinkPrimary")}
                        />
                        <Key
                          keyString="Enter"
                          color={color("pinkPrimary")}
                          hoverColor={color("pinkPrimary")}
                        />
                      </KeyContainer>
                    </AcceptButton>
                  </ButtonBar>
                )}
              </DiffViewWrapper>
            )}
            {/* Metrics view */}
            {activeBuffer.metricsViewState && <Metrics key={activeBuffer.id} />}
            {/* Notifications - show for both regular editor and diff buffer views */}
            {activeBuffer.editorViewState && (
              <Notifications onClearNotifications={handleClearNotifications} />
            )}
          </EditorPane>
        </EditorContent>
      </EditorLeftPane>
    </EditorPaneWrapper>
  )
}

const EditorWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <Editor {...props} innerRef={ref} />
)

export default forwardRef(EditorWithRef)
