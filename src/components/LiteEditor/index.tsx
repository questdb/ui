import React, { useRef, useState } from "react"
import { Editor, DiffEditor, type Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import styled, { useTheme } from "styled-components"
import { Button } from "../Button"
import { CornersOutIcon } from "@phosphor-icons/react"
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

  .view-overlays > * {
    overflow-x: hidden;
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

  .grayed-out-line {
    opacity: 0.5;
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
  top: 1rem;
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
  maxHeight?: number
  compactToolbar?: boolean
}

type RegularEditorProps = BaseLiteEditorProps & {
  diffEditor?: false
  value: string
  original?: never
  modified?: never
  grayedOutLines?: [number, number] | null
}

type DiffEditorProps = BaseLiteEditorProps & {
  diffEditor: true
  original: string
  modified: string
  value?: never
  handleScrollNeeded: () => void
}

type LiteEditorProps = (RegularEditorProps | DiffEditorProps) & {
  onOpenInEditor: () => void
}

const LiteEditorToolbar = ({
  onOpenInEditor,
  onCopy,
  copied,
  diffEditor,
  compact = false,
}: {
  diffEditor: boolean
  onOpenInEditor: () => void
  onCopy: () => void
  copied: boolean
  compact?: boolean
}) => {
  const appTheme = useTheme()
  const Icon = diffEditor ? SquareSplitHorizontalIcon : CornersOutIcon
  return (
    <ButtonsContainer>
      <OpenInEditorButton
        className="open-in-editor-btn"
        onClick={onOpenInEditor}
        title="Open in editor"
        data-hook="ai-open-in-editor-button"
      >
        {!compact && "Open in editor"}
        <Icon size="1.8rem" color={appTheme.color.offWhite} />
      </OpenInEditorButton>
      {!compact && (
        <CopyButtonBase
          skin="transparent"
          onClick={onCopy}
          title="Copy to clipboard"
        >
          {copied && <SuccessIcon size="1rem" />}
          <FileCopy size="1.8rem" />
        </CopyButtonBase>
      )}
    </ButtonsContainer>
  )
}

type LiteEditorContentProps = Omit<BaseLiteEditorProps, "maxHeight"> &
  (
    | {
        diffEditor: true
        original: string
        modified: string
        value?: never
        handleScrollNeeded: () => void
        grayedOutLines?: never
      }
    | {
        diffEditor: false
        value: string
        original?: never
        modified?: never
        handleScrollNeeded?: never
        grayedOutLines?: [number, number] | null
      }
  ) & {
    setContentHeight: (contentHeight: number) => void
  }

const applyGrayedOutDecorations = (
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
  grayedOutLines: [number, number],
) => {
  const model = editor.getModel()
  if (!model) return

  const [startLine, endLine] = grayedOutLines

  editor.createDecorationsCollection([
    {
      range: new monaco.Range(
        startLine,
        1,
        endLine,
        model.getLineMaxColumn(endLine),
      ),
      options: {
        inlineClassName: "grayed-out-line",
      },
    },
  ])
}

const LiteEditorContent = React.memo(
  (props: LiteEditorContentProps) => {
    const {
      diffEditor,
      value,
      language,
      theme,
      fontSize,
      lineHeight,
      setContentHeight,
    } = props

    const scrolledRef = useRef<boolean>(false)

    if (diffEditor) {
      return (
        <DiffEditor
          height="100%"
          language={language}
          original={props.original}
          modified={props.modified}
          theme={theme}
          onMount={(editor) => {
            setContentHeight(editor.getModifiedEditor().getContentHeight())
            editor.getModifiedEditor().onDidContentSizeChange((e) => {
              if (e.contentHeightChanged) {
                setContentHeight(e.contentHeight)
              }
              props.handleScrollNeeded()
            })
            editor.onDidUpdateDiff(() => {
              if (scrolledRef.current) return
              const lineChange = editor.getLineChanges()?.[0]
              if (lineChange) {
                scrolledRef.current = true
                editor
                  .getModifiedEditor()
                  .revealLineNearTop(lineChange.modifiedStartLineNumber)
              }
            })
          }}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
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
              handleMouseWheel: false,
            },
            stickyScroll: {
              enabled: false,
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
        height="100%"
        language={language}
        value={value}
        theme={theme}
        onMount={(editor, monaco) => {
          setContentHeight(editor.getContentHeight())
          editor.onDidContentSizeChange((e) => {
            if (e.contentHeightChanged) {
              setContentHeight(e.contentHeight)
            }
          })
          if (props.grayedOutLines) {
            applyGrayedOutDecorations(editor, monaco, props.grayedOutLines)
          }
        }}
        options={{
          automaticLayout: true,
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
          wordWrap: "on",
          scrollbar: {
            useShadows: false,
            vertical: "hidden",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
            handleMouseWheel: false,
          },
          stickyScroll: {
            enabled: false,
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
      prevProps.grayedOutLines?.[0] === nextProps.grayedOutLines?.[0] &&
      prevProps.grayedOutLines?.[1] === nextProps.grayedOutLines?.[1]
    )
  },
)

export const LiteEditor: React.FC<LiteEditorProps> = ({
  language = QuestDBLanguageName,
  theme = "dracula",
  fontSize = 12,
  lineHeight = 20,
  maxHeight,
  compactToolbar = false,
  ...props
}) => {
  const [copied, setCopied] = useState(false)
  const [contentHeight, setContentHeight] = useState(1)
  const handleCopy = (value: string) => {
    void copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const effectiveHeight =
    maxHeight !== undefined ? Math.min(contentHeight, maxHeight) : contentHeight
  const showToolbarForRegularEditor =
    maxHeight !== undefined && contentHeight > maxHeight

  if (props.diffEditor) {
    return (
      <EditorWrapper
        $noBorder
        style={{
          height: effectiveHeight,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        <LiteEditorToolbar
          diffEditor
          onOpenInEditor={props.onOpenInEditor}
          onCopy={() => handleCopy(props.modified)}
          copied={copied}
        />
        <LiteEditorContent
          diffEditor
          original={props.original}
          modified={props.modified}
          language={language}
          theme={theme}
          fontSize={fontSize}
          lineHeight={lineHeight}
          setContentHeight={setContentHeight}
          handleScrollNeeded={props.handleScrollNeeded}
        />
      </EditorWrapper>
    )
  }
  return (
    <EditorWrapper style={{ height: effectiveHeight }}>
      {showToolbarForRegularEditor || compactToolbar ? (
        <LiteEditorToolbar
          diffEditor={false}
          onOpenInEditor={props.onOpenInEditor}
          onCopy={() => handleCopy(props.value ?? "")}
          copied={copied}
          compact={compactToolbar}
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
        language={language}
        theme={theme}
        fontSize={fontSize}
        lineHeight={lineHeight}
        setContentHeight={setContentHeight}
        grayedOutLines={props.grayedOutLines}
      />
    </EditorWrapper>
  )
}
