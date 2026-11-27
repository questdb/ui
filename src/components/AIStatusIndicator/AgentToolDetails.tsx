import React, { useState } from "react"
import styled, { useTheme } from "styled-components"
import { DiffEditor, Editor } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import type { ToolDiff } from "../../providers/AIStatusProvider"
import { getMonacoThemeName } from "../../utils/monacoInit"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"

// The tallest a diff or an output grows before it scrolls.
const MAX_DIFF_HEIGHT_PX = 320
const LINE_HEIGHT_PX = 18

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: 100%;
  min-width: 0;
  padding: 0.4rem 0 0.4rem 1.9rem;
`

const Box = styled.div`
  border: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.4rem;
  overflow: hidden;
  min-width: 0;
`

const FileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.4rem 0.8rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 1.6rem;
`

const FileName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Added = styled.span`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.dataPositive};
`

const Removed = styled.span`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.dataNegative};
`

const Tag = styled.span`
  flex-shrink: 0;
  margin-left: auto;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-family: ${({ theme }) => theme.font};
`

const Output = styled.pre`
  margin: 0;
  max-height: 20rem;
  overflow: auto;
  padding: 0.6rem 0.8rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.4rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 1.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  white-space: pre;
`

const fileName = (path: string): string =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) ||
  path

// The console ships Monaco without its language packs, so only SQL, in
// QuestDB's own dialect, is highlighted.
const languageOf = (path: string): string =>
  /\.sql$/i.test(path) ? QuestDBLanguageName : "plaintext"

const linesOf = (text: string | null): string[] =>
  text ? text.replace(/\n$/, "").split("\n") : []

// Lines added and removed: those not matched, line for line, on the other
// side. Close enough for a summary; the diff itself shows the exact change.
export const diffStats = (
  oldText: string | null,
  newText: string,
): { added: number; removed: number } => {
  const remaining = new Map<string, number>()
  for (const line of linesOf(oldText)) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1)
  }
  let added = 0
  for (const line of linesOf(newText)) {
    const left = remaining.get(line) ?? 0
    if (left > 0) remaining.set(line, left - 1)
    else added += 1
  }
  let removed = 0
  for (const left of remaining.values()) removed += left
  return { added, removed }
}

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  folding: false,
  glyphMargin: false,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false },
  automaticLayout: true,
  fontSize: 12,
  lineHeight: LINE_HEIGHT_PX,
}

const FileDiff = ({ diff }: { diff: ToolDiff }) => {
  const theme = useTheme()
  const [height, setHeight] = useState(LINE_HEIGHT_PX * 3)
  const stats = diffStats(diff.oldText, diff.newText)
  const isNew = diff.oldText === null && !diff.truncated
  return (
    <Box data-hook="agent-tool-diff">
      <FileHeader title={diff.path}>
        <FileName>{fileName(diff.path)}</FileName>
        {!diff.truncated && stats.added > 0 && <Added>+{stats.added}</Added>}
        {!diff.truncated && stats.removed > 0 && (
          <Removed>−{stats.removed}</Removed>
        )}
        {isNew && <Tag>New file</Tag>}
        {diff.truncated && <Tag>Too large to show</Tag>}
      </FileHeader>
      {isNew && (
        // A new file is all new: shown as it is, not against an empty one.
        <div style={{ height: Math.min(height, MAX_DIFF_HEIGHT_PX) }}>
          <Editor
            height="100%"
            value={diff.newText}
            language={languageOf(diff.path)}
            theme={getMonacoThemeName(theme.mode)}
            onMount={(created) => {
              setHeight(created.getContentHeight())
              created.onDidContentSizeChange((event) => {
                if (event.contentHeightChanged) setHeight(event.contentHeight)
              })
            }}
            options={EDITOR_OPTIONS}
          />
        </div>
      )}
      {!diff.truncated && !isNew && (
        <div style={{ height: Math.min(height, MAX_DIFF_HEIGHT_PX) }}>
          <DiffEditor
            height="100%"
            original={diff.oldText ?? ""}
            modified={diff.newText}
            language={languageOf(diff.path)}
            theme={getMonacoThemeName(theme.mode)}
            onMount={(editor) => {
              const modified = editor.getModifiedEditor()
              setHeight(modified.getContentHeight())
              modified.onDidContentSizeChange((event) => {
                if (event.contentHeightChanged) setHeight(event.contentHeight)
              })
            }}
            options={{
              ...EDITOR_OPTIONS,
              originalEditable: false,
              renderSideBySide: false,
              hideUnchangedRegions: { enabled: true },
              renderOverviewRuler: false,
            }}
          />
        </div>
      )}
    </Box>
  )
}

// What one of the agent's own tools did: the files it changed and what it
// printed.
export const AgentToolDetails = ({
  output,
  diffs,
}: {
  output?: string
  diffs?: ToolDiff[]
}) => (
  <Root data-hook="agent-tool-details">
    {diffs?.map((diff, index) => (
      // eslint-disable-next-line react/no-array-index-key -- a call's diffs never reorder
      <FileDiff key={`${diff.path}-${index}`} diff={diff} />
    ))}
    {output && (
      <Output tabIndex={0} data-hook="agent-tool-output">
        {output}
      </Output>
    )}
  </Root>
)
