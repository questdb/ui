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
  useMemo,
  useCallback,
} from "react"
import styled from "styled-components"
import { DiffEditor, Editor as MonacoEditor } from "@monaco-editor/react"

import { PaneWrapper, Box, Button, Key } from "../../components"
import { useKeyPress } from "../../hooks"

import Monaco from "./Monaco"
import { Tabs } from "./Monaco/tabs"
import { useEditor } from "../../providers/EditorProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { Metrics } from "./Metrics"
import Notifications from "../../scenes/Notifications"
import type { QueryKey } from "../../store/Query/types"
import type { ErrorResult } from "../../utils"
import { color, platform } from "../../utils"
import { getLastUnactionedDiff } from "../../providers/AIConversationProvider/utils"
import { useDispatch } from "react-redux"
import { actions } from "../../store"
import { QuestDBLanguageName, normalizeQueryText } from "./Monaco/utils"

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
  margin: 1rem auto;
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
  const { activeBuffer, addBuffer, cleanupExecutionRefs } = useEditor()
  const {
    getConversationMeta,
    activeConversationMessages,
    acceptSuggestion,
    rejectSuggestion,
  } = useAIConversation()

  const handleClearNotifications = (bufferId: number) => {
    dispatch(actions.query.cleanupBufferNotifications(bufferId))
    cleanupExecutionRefs(bufferId)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get("query")
    if (query && activeBuffer.metricsViewState) {
      void addBuffer({ label: "Query" })
    }
  }, [])

  const isMonacoHidden =
    !!activeBuffer.isPreviewBuffer || !!activeBuffer.metricsViewState

  const isDiffPreview =
    activeBuffer.isPreviewBuffer && activeBuffer.previewContent?.type === "diff"

  const isCodePreview =
    activeBuffer.isPreviewBuffer && activeBuffer.previewContent?.type === "code"

  const pendingDiffInfo = useMemo(() => {
    if (
      !isDiffPreview ||
      !activeBuffer.previewContent ||
      activeBuffer.previewContent.type !== "diff" ||
      !activeBuffer.previewContent.conversationId
    ) {
      return null
    }

    const conversationId = activeBuffer.previewContent.conversationId
    const meta = getConversationMeta(conversationId)

    if (!meta) {
      return null
    }

    const lastUnactionedDiff = getLastUnactionedDiff(activeConversationMessages)
    if (!lastUnactionedDiff) {
      return null
    }

    const normalizedDiffModified = normalizeQueryText(
      activeBuffer.previewContent.modified || "",
    )
    const normalizedCurrentSQL = normalizeQueryText(meta.currentSQL || "")

    if (normalizedDiffModified !== normalizedCurrentSQL) {
      return null
    }

    return {
      conversationId,
      messageId: lastUnactionedDiff.id,
    }
  }, [
    activeBuffer,
    isDiffPreview,
    getConversationMeta,
    activeConversationMessages,
  ])

  const handleAcceptFromDiffEditor = useCallback(async () => {
    if (
      !pendingDiffInfo ||
      !activeBuffer.previewContent ||
      activeBuffer.previewContent.type !== "diff"
    )
      return

    const { conversationId } = pendingDiffInfo

    // Use unified acceptSuggestion from provider
    await acceptSuggestion({
      conversationId,
      messageId: pendingDiffInfo.messageId,
    })
  }, [pendingDiffInfo, activeBuffer.previewContent, acceptSuggestion])

  const handleRejectFromDiffEditor = useCallback(async () => {
    if (!pendingDiffInfo) return

    const { conversationId, messageId } = pendingDiffInfo

    // Use unified rejectSuggestion from provider
    await rejectSuggestion(conversationId, messageId)
  }, [pendingDiffInfo, rejectSuggestion])

  // Keyboard shortcut: Escape to reject diff
  const escPressed = useKeyPress("Escape")
  useEffect(() => {
    if (escPressed && pendingDiffInfo) {
      void handleRejectFromDiffEditor()
    }
  }, [escPressed, pendingDiffInfo, handleRejectFromDiffEditor])

  // Keyboard shortcut: Ctrl/Cmd+Enter to accept diff
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && pendingDiffInfo) {
        e.preventDefault()
        void handleAcceptFromDiffEditor()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [pendingDiffInfo, handleAcceptFromDiffEditor])

  return (
    <EditorPaneWrapper ref={innerRef} {...rest}>
      <EditorLeftPane>
        <Tabs />
        <EditorContent>
          <EditorPane>
            {activeBuffer.editorViewState && <Monaco hidden={isMonacoHidden} />}
            {/* Diff preview mode */}
            {isDiffPreview && (
              <DiffViewWrapper>
                <DiffEditorContainer data-hook="diff-editor-container">
                  <DiffEditor
                    key={
                      (
                        activeBuffer.previewContent as {
                          original: string
                          modified: string
                        }
                      ).original +
                      (
                        activeBuffer.previewContent as {
                          original: string
                          modified: string
                        }
                      ).modified
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
                    original={
                      (activeBuffer.previewContent as { original: string })
                        .original
                    }
                    modified={
                      (activeBuffer.previewContent as { modified: string })
                        .modified
                    }
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
                    <RejectButton
                      onClick={handleRejectFromDiffEditor}
                      data-hook="diff-reject-button"
                    >
                      Reject
                      <KeyContainer>
                        <Key
                          keyString="Esc"
                          color={color("pinkPrimary")}
                          hoverColor={color("pinkPrimary")}
                        />
                      </KeyContainer>
                    </RejectButton>
                    <AcceptButton
                      onClick={handleAcceptFromDiffEditor}
                      data-hook="diff-accept-button"
                    >
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
            {/* Code preview mode */}
            {isCodePreview && (
              <DiffViewWrapper>
                <DiffEditorContainer data-hook="code-preview-container">
                  <MonacoEditor
                    value={
                      (activeBuffer.previewContent as { value: string }).value
                    }
                    language={QuestDBLanguageName}
                    theme="dracula"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: "off",
                      hideCursorInOverviewRuler: true,
                      automaticLayout: true,
                      fontSize: 14,
                      lineHeight: 24,
                      folding: false,
                      wordWrap: "on",
                    }}
                  />
                </DiffEditorContainer>
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
