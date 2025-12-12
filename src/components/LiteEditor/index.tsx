import React, { useRef } from "react"
import { Editor, DiffEditor } from "@monaco-editor/react"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import styled from "styled-components"

const EditorWrapper = styled.div<{ $noBorder?: boolean }>`
  padding: ${({ $noBorder }) => ($noBorder ? 0 : "0 1.2rem")};
  border-radius: 8px;
  border: ${({ $noBorder, theme }) =>
    $noBorder ? "none" : `1px solid ${theme.color.selection}`};
  background: ${({ theme }) => theme.color.backgroundDarker};

  .monaco-editor-background {
    background: ${({ theme }) => theme.color.backgroundDarker};
  }

  .monaco-editor {
    background: ${({ theme }) => theme.color.backgroundDarker};
  }

  .editor.original {
    display: none !important;
  }

  .view-lines {
    width: 100% !important;
  }

  .margin {
    display: none !important;
  }

  .monaco-scrollable-element {
    left: 0 !important;
  }

  .scrollbar {
    display: none !important;
  }
`

type BaseLiteEditorProps = {
  height?: string | number
  language?: string
  theme?: string
  fontSize?: number
  padding?: { top?: number; bottom?: number }
  lineHeight?: number
  noBorder?: boolean
}

type RegularEditorProps = BaseLiteEditorProps & {
  diffEditor?: false
  value: string
  original?: never
  modified?: never
}

type DiffEditorProps = BaseLiteEditorProps & {
  diffEditor: true
  original: string
  modified: string
  value?: never
}

type LiteEditorProps = RegularEditorProps | DiffEditorProps

/**
 * A lightweight read-only Monaco editor optimized for displaying code.
 * All editing features, line numbers, minimap, glyph margin, and scrollbars are disabled.
 * Use this for read-only code display in chat windows, messages, etc.
 *
 * When `diffEditor` is true, renders a diff view with `original` and `modified` props.
 * Otherwise, renders a regular editor with `value` prop.
 */
export const LiteEditor: React.FC<LiteEditorProps> = ({
  height = "100%",
  language = QuestDBLanguageName,
  theme = "dracula",
  fontSize = 12,
  padding = { top: 8, bottom: 8 },
  lineHeight = 20,
  noBorder,
  ...props
}) => {
  const scrolledRef = useRef<boolean>(false)
  if (props.diffEditor) {
    return (
      <EditorWrapper
        $noBorder={noBorder}
        style={{
          height,
          ...(!noBorder ? { paddingTop: 8, paddingBottom: 8 } : undefined),
        }}
      >
        <DiffEditor
          height={height}
          language={language}
          original={props.original}
          modified={props.modified}
          theme={theme}
          onMount={(editor) => {
            editor.onDidUpdateDiff(() => {
              if (scrolledRef.current) return
              const lineChange = editor.getLineChanges()?.[0]
              if (lineChange) {
                scrolledRef.current = true
                editor
                  .getModifiedEditor()
                  .revealLineInCenter(lineChange.modifiedStartLineNumber)
              }
            })
          }}
          options={{
            readOnly: true,
            lineNumbers: "off",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            scrollbar: {
              vertical: "hidden",
              horizontal: "hidden",
            },
            automaticLayout: true,
            folding: false,
            wordWrap: "on",
            glyphMargin: false,
            renderSideBySide: false,
            enableSplitViewResizing: false,
            renderIndicators: false,
            renderOverviewRuler: false,
            hideCursorInOverviewRuler: true,
            originalEditable: false,
            overviewRulerBorder: false,
            fontSize,
            lineHeight,
          }}
        />
      </EditorWrapper>
    )
  }

  return (
    <EditorWrapper $noBorder={noBorder} style={{ height }}>
      <Editor
        height={height}
        language={language}
        value={props.value}
        theme={theme}
        options={{
          readOnly: true,
          lineNumbers: "off",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: "hidden",
            horizontal: "hidden",
          },
          fontSize,
          padding,
        }}
      />
    </EditorWrapper>
  )
}
