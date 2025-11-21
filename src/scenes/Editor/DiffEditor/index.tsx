import React, { useMemo, useRef, useState, useEffect } from "react"
import styled from "styled-components"
import { DiffEditor } from "@monaco-editor/react"
import type { Monaco, DiffOnMount } from "@monaco-editor/react"
import { Button, Box, Text, Key } from "../../../components"
import { useEditor } from "../../../providers"
import { QuestDBLanguageName } from "../Monaco/utils"
import type { editor } from "monaco-editor"
import dracula from "../Monaco/dracula"
import { toast } from "../../../components/Toast"
import type { PendingFix } from "../../Editor"
import { color, platform } from "../../../utils"

const Container = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  background: ${color("backgroundLighter")};
  width: 100%;
`

const ExplanationBox = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  background: rgba(68, 71, 90, 0.56);
  padding: 0.4rem;
  border-radius: 0.6rem;
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
`

const AssistantHeader = styled(Box).attrs({
  alignItems: "flex-start",
  gap: "1rem",
})`
  margin-right: auto;
  padding: 0.4rem 0;
  flex: 1 0 auto;
`

const SparkleIcon = styled.img`
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
`

const AssistantLabel = styled(Text)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
  text-transform: uppercase;
  color: ${color("foreground")};
  line-height: 1;
`

const ExplanationContent = styled(Box)`
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 0.6rem;
  padding: 0.8rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
`

const ExplanationText = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font};
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("foreground")};
  white-space: pre-wrap;
  max-height: 100%;

  .explanation-code-block {
    background: #2d303e;
    border: 1px solid #44475a;
    border-radius: 0.6rem;
    padding: 0 0.3rem;
    display: inline-flex;
    gap: 1rem;
    align-items: center;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: #9089fc;
  }
`

const ButtonBar = styled(Box)`
  padding: 0.5rem 1rem;
  gap: 1rem;
  justify-content: center;
  flex-shrink: 0;
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
`

const ActionsContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  gap: 1rem;
  padding: 1.5rem;
  width: 33%;
  max-width: 40rem;
`

const EditorContainer = styled.div`
  flex: 1;
  overflow: hidden;
`

type Props = {
  pendingFixRef: React.MutableRefObject<PendingFix | null>
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

export const DiffEditorComponent = ({ pendingFixRef }: Props) => {
  const { activeBuffer, setActiveBuffer, deleteBuffer, buffers } = useEditor()
  const [diffEditor, setDiffEditor] = useState<editor.IDiffEditor | null>(null)
  const scrolledRef = useRef(false)
  const monacoRef = useRef<Monaco | null>(null)

  const { original, modified, explanation, queryStartOffset, originalQuery } =
    activeBuffer.diffContent!
  const originalBufferId = activeBuffer.originalBufferId

  const explanationWithCodeBlocks = useMemo(
    () =>
      explanation.replace(
        /`([^`]+)`/g,
        "<code class='explanation-code-block'>" + "$1" + "</code>",
      ),
    [explanation],
  )

  const destroyEditor = async (setActiveBuffer?: boolean) => {
    diffEditor?.dispose()
    if (activeBuffer.id) {
      await deleteBuffer(activeBuffer.id, setActiveBuffer ?? false)
    }
  }

  const handleEditorDidMount: DiffOnMount = (editor, monaco) => {
    monacoRef.current = monaco
    setDiffEditor(editor)

    editor.getOriginalEditor().updateOptions({ readOnly: true })
    editor.onDidUpdateDiff(() => {
      if (scrolledRef.current) {
        return
      }

      const lineChange = editor.getLineChanges()?.[0]
      if (lineChange) {
        scrolledRef.current = true
        editor
          .getOriginalEditor()
          .revealLineNearTop(lineChange.originalStartLineNumber)
        editor
          .getModifiedEditor()
          .revealLineNearTop(lineChange.modifiedStartLineNumber)
      }
    })

    monaco.editor.defineTheme("dracula", dracula)
    monaco.editor.setTheme("dracula")
  }

  const handleAccept = async () => {
    if (!diffEditor || !originalBufferId) return

    const originalBuffer = buffers.find((b) => b.id === originalBufferId)
    if (!originalBuffer || originalBuffer.archived) {
      toast.error(
        `The tab has been ${originalBuffer ? "archived" : "deleted"}. Fix cannot be applied.`,
      )
      await destroyEditor(true)
      return
    }

    const modifiedContent = diffEditor.getModifiedEditor().getValue()
    pendingFixRef.current = {
      modifiedContent,
      queryStartOffset,
      originalQuery,
      originalBufferId,
    }

    await destroyEditor()
    await setActiveBuffer(originalBuffer)
  }

  const handleReject = async () => {
    if (!originalBufferId) return
    const originalBuffer = buffers.find((b) => b.id === originalBufferId)

    await destroyEditor()
    if (originalBuffer && !originalBuffer.archived) {
      await setActiveBuffer(originalBuffer)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        void handleReject()
        return
      }

      if (!((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
        return
      }
      e.preventDefault()
      void handleAccept()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleAccept, handleReject])

  return (
    <Container>
      <EditorContainer>
        <DiffEditor
          height="100%"
          language={QuestDBLanguageName}
          original={original}
          modified={modified}
          onMount={handleEditorDidMount}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            readOnly: false,
            originalEditable: false,
            fontSize: 14,
            lineHeight: 24,
          }}
        />
      </EditorContainer>
      <ActionsContainer>
        <ExplanationBox>
          <AssistantHeader>
            <SparkleIcon src="/assets/ai-sparkle.svg" alt="" />
            <AssistantLabel>Assistant</AssistantLabel>
          </AssistantHeader>
          <ExplanationContent>
            <ExplanationText
              dangerouslySetInnerHTML={{ __html: explanationWithCodeBlocks }}
            />
          </ExplanationContent>
        </ExplanationBox>
        <ButtonBar align="center" justifyContent="center">
          <RejectButton onClick={handleReject}>
            Reject
            <KeyContainer>
              <Key
                keyString="Esc"
                color={color("pinkPrimary")}
                hoverColor={color("pinkPrimary")}
              />
            </KeyContainer>
          </RejectButton>
          <AcceptButton onClick={handleAccept}>
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
      </ActionsContainer>
    </Container>
  )
}
