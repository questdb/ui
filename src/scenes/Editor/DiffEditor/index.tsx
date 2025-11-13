import React, { useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { DiffEditor } from "@monaco-editor/react"
import type { Monaco, DiffOnMount } from "@monaco-editor/react"
import { Button, Box } from "../../../components"
import { useEditor } from "../../../providers"
import { QuestDBLanguageName } from "../Monaco/utils"
import type { editor } from "monaco-editor"
import dracula from "../Monaco/dracula"
import { toast } from "../../../components/Toast"
import type { PendingFix } from "../../Editor"
import { color } from "../../../utils"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: ${color("backgroundLighter")};
`

const ExplanationBox = styled(Box)`
  display: flex;
  align-items: flex-start;
  background: ${color("midnight")};
  padding: 1.5rem 2rem;
  font-size: 1.4rem;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 150px;
  overflow-y: auto;

  .explanation-code-block {
    background: #2d303e;
    border: 1px solid #44475a;
    border-radius: 0.6rem;
    padding: 0.1rem 0.3rem;
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
`

const EditorContainer = styled.div`
  flex: 1;
  overflow: hidden;
`

type Props = {
  pendingFixRef: React.MutableRefObject<PendingFix | null>
}

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

  return (
    <Container>
      {explanation && (
        <ExplanationBox>
          <img src="/assets/ai-sparkle.svg" alt="" width={16} height={16} />
          <p
            style={{ margin: 0 }}
            dangerouslySetInnerHTML={{ __html: explanationWithCodeBlocks }}
          />
        </ExplanationBox>
      )}
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
      <ButtonBar align="center" justifyContent="flex-end">
        <Button skin="gradient" gradientWeight="thick" onClick={handleReject}>
          Reject
        </Button>
        <Button skin="gradient" onClick={handleAccept}>
          Accept
        </Button>
      </ButtonBar>
    </Container>
  )
}
