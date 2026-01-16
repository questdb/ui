import React, { useRef, useState } from "react"
import { Editor, DiffEditor } from "@monaco-editor/react"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import styled, { useTheme } from "styled-components"
import { Button } from "../Button"
import { FileCopy } from "@styled-icons/remix-line"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { SquareSplitHorizontalIcon } from "@phosphor-icons/react"

const EditorWrapper = styled.div<{ $noBorder?: boolean }>`
  position: relative;
  padding: ${({ $noBorder }) => ($noBorder ? 0 : "0 1.2rem")};
  border-radius: 8px;
  border: ${({ $noBorder, theme }) =>
    $noBorder ? "none" : `1px solid ${theme.color.selection}`};
  background: ${({ theme }) => theme.color.backgroundDarker};
  overflow-y: hidden;

  .monaco-editor-background {
    background: ${({ theme }) => theme.color.backgroundDarker};
  }

  .monaco-editor {
    background: ${({ theme }) => theme.color.backgroundDarker};
  }

  .lines-content {
    top: 0 !important;
  }

  .editor.original {
    display: none !important;
  }

  .editor-scrollable {
    width: 100% !important;
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
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 0;
  color: ${({ theme }) => theme.color.offWhite};
`

const SuccessIcon = styled(CheckboxCircle)`
  position: absolute;
  transform: translate(75%, -75%);
  color: ${({ theme }) => theme.color.green};
`

const ButtonsContainer = styled.div`
  position: absolute;
  top: 0.8rem;
  right: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1.2rem;
  z-index: 10;
`

const CopyButtonBase = styled(Button)`
  color: #e5e7eb;
  padding: 0 0.6rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const CopyButtonFloating = styled(CopyButtonBase)`
  position: absolute;
  top: 0.2rem;
  right: 0.8rem;
  z-index: 10;
`

type BaseLiteEditorProps = {
  language?: string
  theme?: string
  fontSize?: number
  lineHeight?: number
  maxHeight: number
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

type LiteEditorProps = (RegularEditorProps | DiffEditorProps) & {
  onOpenInEditor: () => void
}

const LiteEditorToolbar = ({
  onOpenInEditor,
  onCopy,
  copied,
}: {
  onOpenInEditor: () => void
  onCopy: () => void
  copied: boolean
}) => {
  const appTheme = useTheme()
  return (
    <ButtonsContainer>
      <OpenInEditorButton
        className="open-in-editor-btn"
        onClick={onOpenInEditor}
        title="Open in editor"
        data-hook="ai-open-in-editor-button"
      >
        Open in editor
        <SquareSplitHorizontalIcon
          size="1.8rem"
          color={appTheme.color.offWhite}
        />
      </OpenInEditorButton>
      <CopyButtonBase
        skin="transparent"
        onClick={onCopy}
        title="Copy to clipboard"
      >
        {copied && <SuccessIcon size="1rem" />}
        <FileCopy size="1.8rem" />
      </CopyButtonBase>
    </ButtonsContainer>
  )
}

type LiteEditorContentProps = BaseLiteEditorProps &
  (
    | {
        diffEditor: true
        original: string
        modified: string
        value?: never
        effectiveHeight?: never
      }
    | {
        diffEditor: false
        value: string
        effectiveHeight: number
        original?: never
        modified?: never
      }
  )

const LiteEditorContent = React.memo(
  (props: LiteEditorContentProps) => {
    const {
      diffEditor,
      value,
      maxHeight,
      language,
      theme,
      fontSize,
      lineHeight,
    } = props

    const scrolledRef = useRef<boolean>(false)

    if (diffEditor) {
      return (
        <DiffEditor
          height={maxHeight}
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
              useShadows: false,
              vertical: "hidden",
              horizontal: "hidden",
              alwaysConsumeMouseWheel: false,
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
      )
    }
    return (
      <Editor
        height={props.effectiveHeight}
        language={language}
        value={value}
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
            useShadows: false,
            vertical: "hidden",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
          },
          fontSize,
          padding: { top: 8, bottom: 8 },
          lineHeight,
        }}
      />
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.diffEditor === nextProps.diffEditor &&
      prevProps.original === nextProps.original &&
      prevProps.modified === nextProps.modified &&
      prevProps.maxHeight === nextProps.maxHeight
    )
  },
)

export const LiteEditor: React.FC<LiteEditorProps> = ({
  language = QuestDBLanguageName,
  theme = "dracula",
  fontSize = 12,
  lineHeight = 20,
  maxHeight,
  ...props
}) => {
  const [copied, setCopied] = useState(false)
  const handleCopy = (value: string) => {
    void copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getContentHeight = (content: string) => {
    const lineCount = content.split("\n").length
    return lineCount * lineHeight + (props.diffEditor ? 0 : 16)
  }

  if (props.diffEditor) {
    return (
      <EditorWrapper
        $noBorder
        style={{
          height: maxHeight,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        <LiteEditorToolbar
          onOpenInEditor={props.onOpenInEditor}
          onCopy={() => handleCopy(props.modified)}
          copied={copied}
        />
        <LiteEditorContent
          diffEditor
          original={props.original}
          modified={props.modified}
          maxHeight={maxHeight}
          language={language}
          theme={theme}
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
      </EditorWrapper>
    )
  }

  const contentHeight = getContentHeight(props.value)
  const effectiveHeight = maxHeight
    ? Math.min(contentHeight, maxHeight)
    : contentHeight
  const showOpenInEditor = contentHeight > maxHeight

  return (
    <EditorWrapper style={{ height: effectiveHeight }}>
      {showOpenInEditor ? (
        <LiteEditorToolbar
          onOpenInEditor={props.onOpenInEditor}
          onCopy={() => handleCopy(props.value ?? "")}
          copied={copied}
        />
      ) : (
        <CopyButtonFloating
          skin="transparent"
          onClick={() => handleCopy(props.value ?? "")}
          title="Copy to clipboard"
        >
          {copied && <SuccessIcon size="1rem" />}
          <FileCopy size="1.8rem" />
        </CopyButtonFloating>
      )}
      <LiteEditorContent
        diffEditor={false}
        value={props.value}
        maxHeight={maxHeight}
        effectiveHeight={effectiveHeight}
        language={language}
        theme={theme}
        fontSize={fontSize}
        lineHeight={lineHeight}
      />
    </EditorWrapper>
  )
}
