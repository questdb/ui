import React, { useRef, useState } from "react"
import { Editor, DiffEditor } from "@monaco-editor/react"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import styled, { useTheme } from "styled-components"
import { Button } from "../Button"
import { FileCopy } from "@styled-icons/remix-line"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { SquareSplitHorizontalIcon } from "@phosphor-icons/react"
import { copyToClipboard } from "../../utils/copyToClipboard"

const EditorWrapper = styled.div<{ $noBorder?: boolean }>`
  position: relative;
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
    pointer-events: none;
  }

  .current-line {
    background: transparent !important;
    border: 0 !important;
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

  .open-in-editor-btn {
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
  }

  &:hover .open-in-editor-btn {
    opacity: 1;
  }
`

const OpenInEditorButton = styled(Button).attrs({ skin: "transparent" })`
  gap: 1rem;
  font-size: 1.2rem;
`

const SuccessIcon = styled(CheckboxCircle)`
  position: absolute;
  transform: translate(75%, -75%);
  color: ${({ theme }) => theme.color.green};
`

const ButtonsContainer = styled.div`
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1.2rem;
  z-index: 10;
`

const CopyButton = styled(Button)`
  position: absolute;
  top: 0.2rem;
  right: 0.8rem;
  color: #e5e7eb;
  z-index: 10;
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
  onExpandDiff?: () => void
}

type LiteEditorProps = RegularEditorProps | DiffEditorProps

export const LiteEditor: React.FC<LiteEditorProps> = React.memo(
  ({
    height = "100%",
    language = QuestDBLanguageName,
    theme = "dracula",
    fontSize = 12,
    padding = { top: 8, bottom: 8 },
    lineHeight = 20,
    noBorder,
    ...props
  }) => {
    const appTheme = useTheme()
    const scrolledRef = useRef<boolean>(false)
    const [copied, setCopied] = useState(false)
    const handleCopy = (value: string) => {
      void copyToClipboard(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    if (props.diffEditor) {
      return (
        <EditorWrapper
          $noBorder={noBorder}
          style={{
            height,
            ...(!noBorder ? { paddingTop: 8, paddingBottom: 8 } : undefined),
          }}
        >
          <ButtonsContainer>
            {props.onExpandDiff && (
              <OpenInEditorButton
                className="open-in-editor-btn"
                onClick={props.onExpandDiff}
                title="Open in editor"
                data-hook="diff-open-in-editor-button"
              >
                Open in editor
                <SquareSplitHorizontalIcon
                  size="1.8rem"
                  color={appTheme.color.offWhite}
                />
              </OpenInEditorButton>
            )}
            <Button
              skin="transparent"
              onClick={() => handleCopy(props.modified)}
              title="Copy to clipboard"
            >
              {copied && <SuccessIcon size="1rem" />}
              <FileCopy size="1.8rem" />
            </Button>
          </ButtonsContainer>
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
        <CopyButton
          skin="transparent"
          onClick={() => handleCopy(props.value ?? "")}
          title="Copy to clipboard"
        >
          {copied && <SuccessIcon size="1rem" />}
          <FileCopy size="1.8rem" />
        </CopyButton>
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
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.diffEditor === nextProps.diffEditor &&
      prevProps.original === nextProps.original &&
      prevProps.modified === nextProps.modified
    )
  },
)
