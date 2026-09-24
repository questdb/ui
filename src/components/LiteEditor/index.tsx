import React, { useEffect, useRef, useState } from "react"
import { DiffEditor } from "@monaco-editor/react"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import styled, { useTheme } from "styled-components"
import { Button } from "../Button"
import { CornersOutIcon } from "@phosphor-icons/react"
import { FileCopy } from "../icons"
import { CheckboxCircle } from "../icons"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { SquareSplitHorizontalIcon } from "@phosphor-icons/react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { getMonacoThemeName } from "../../utils/monacoInit"
import { HighlightedSql } from "../HighlightedSql"

const EditorWrapper = styled.div<{ $noBorder?: boolean }>`
  position: relative;
  padding: ${({ $noBorder }) => ($noBorder ? 0 : "0 1.2rem")};
  border-radius: 8px;
  border: ${({ $noBorder, theme }) =>
    $noBorder ? "none" : `1px solid ${theme.color.interactionNeutral}`};
  background: ${({ theme }) => theme.color.editorCanvas};
  overflow-y: hidden;

  .monaco-editor-background {
    background: ${({ theme }) => theme.color.editorCanvas};
  }

  .monaco-editor {
    background: ${({ theme }) => theme.color.editorCanvas};
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

  &:hover .open-in-editor-btn,
  &:focus-within .open-in-editor-btn {
    opacity: 1;
  }
`

const Highlighted = styled(HighlightedSql)<{
  $fontSize: number
  $lineHeight: number
}>`
  margin: 0;
  padding: 8px 0;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: ${({ $fontSize }) => $fontSize}px;
  line-height: ${({ $lineHeight }) => $lineHeight}px;
`

const OpenInEditorButton = styled(Button).attrs({ variant: "ghost" })<{
  $compact: boolean
}>`
  gap: 1rem;
  font-size: 1.2rem;
  ${({ $compact }) =>
    $compact &&
    `
      height: 2.8rem;
      padding: 0.5rem;
    `}
`

const SuccessIcon = styled(CheckboxCircle)`
  position: absolute;
  transform: translate(75%, -75%);
  color: ${({ theme }) => theme.color.statusSuccess};
`

const ButtonsContainer = styled.div<{ $compact: boolean }>`
  position: absolute;
  top: ${({ $compact }) => ($compact ? "0.4rem" : "1rem")};
  right: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ $compact }) => ($compact ? "0.4rem" : "1.2rem")};
  z-index: 10;
`

const CopyButtonBase = styled(Button).attrs({ variant: "ghost" })`
  padding: 0 0.6rem;
`

const CopyButtonFloating = styled(CopyButtonBase).attrs({ size: "sm" })`
  position: absolute;
  top: 0.4rem;
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
  toolbarActions?: React.ReactNode
  scrollable?: boolean
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
  actions,
}: {
  diffEditor: boolean
  onOpenInEditor: () => void
  onCopy: () => void
  copied: boolean
  compact?: boolean
  actions?: React.ReactNode
}) => {
  const appTheme = useTheme()
  const Icon = diffEditor ? SquareSplitHorizontalIcon : CornersOutIcon
  const label = diffEditor ? "Diff preview" : "Open in editor"
  return (
    <ButtonsContainer
      $compact={compact}
      className={compact && actions ? "open-in-editor-btn" : undefined}
    >
      <OpenInEditorButton
        $compact={compact}
        className="open-in-editor-btn"
        onClick={() => {
          void trackEvent(ConsoleEvent.AI_OPEN_IN_EDITOR, {
            diffEditor,
          })
          onOpenInEditor()
        }}
        title={label}
        data-hook="ai-open-in-editor-button"
      >
        {!compact && label}
        <Icon
          size={compact ? "16px" : "1.8rem"}
          color={appTheme.color.contentSecondary}
        />
      </OpenInEditorButton>
      {actions}
      {!compact && (
        <CopyButtonBase
          className="open-in-editor-btn"
          variant="ghost"
          onClick={onCopy}
          title="Copy to clipboard"
        >
          {copied && <SuccessIcon size="1rem" weight="fill" />}
          <FileCopy size="1.8rem" />
        </CopyButtonBase>
      )}
    </ButtonsContainer>
  )
}

type DiffContentProps = Omit<BaseLiteEditorProps, "maxHeight"> & {
  original: string
  modified: string
  handleScrollNeeded: () => void
  setContentHeight: (contentHeight: number) => void
}

const DiffContent = React.memo(
  ({
    original,
    modified,
    language,
    theme,
    fontSize,
    lineHeight,
    setContentHeight,
    handleScrollNeeded,
  }: DiffContentProps) => {
    const scrolledRef = useRef<boolean>(false)

    return (
      <DiffEditor
        height="100%"
        language={language}
        original={original}
        modified={modified}
        theme={theme}
        onMount={(editor) => {
          setContentHeight(editor.getModifiedEditor().getContentHeight())
          editor.getModifiedEditor().onDidContentSizeChange((e) => {
            if (e.contentHeightChanged) {
              setContentHeight(e.contentHeight)
            }
            handleScrollNeeded()
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
  },
  (prevProps, nextProps) =>
    prevProps.original === nextProps.original &&
    prevProps.modified === nextProps.modified &&
    prevProps.theme === nextProps.theme,
)

export const LiteEditor: React.FC<LiteEditorProps> = ({
  language = QuestDBLanguageName,
  theme: explicitTheme,
  fontSize = 12,
  lineHeight = 20,
  maxHeight,
  compactToolbar = false,
  toolbarActions,
  scrollable = false,
  ...props
}) => {
  const appTheme = useTheme()
  const monacoTheme = explicitTheme ?? getMonacoThemeName(appTheme.mode)
  const [copied, setCopied] = useState(false)
  const [contentHeight, setContentHeight] = useState(1)
  const [overflows, setOverflows] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const handleCopy = (value: string) => {
    void copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const content = contentRef.current
    if (props.diffEditor || maxHeight === undefined || content === null) return

    const observer = new ResizeObserver(() => {
      setOverflows(content.scrollHeight > maxHeight)
    })
    observer.observe(content)

    return () => observer.disconnect()
  }, [maxHeight, props.diffEditor, props.value])

  if (props.diffEditor) {
    const effectiveHeight =
      maxHeight !== undefined
        ? Math.min(contentHeight, maxHeight)
        : contentHeight

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
        <DiffContent
          original={props.original}
          modified={props.modified}
          language={language}
          theme={monacoTheme}
          fontSize={fontSize}
          lineHeight={lineHeight}
          setContentHeight={setContentHeight}
          handleScrollNeeded={props.handleScrollNeeded}
        />
      </EditorWrapper>
    )
  }

  return (
    <EditorWrapper style={{ maxHeight }}>
      {overflows || compactToolbar ? (
        <LiteEditorToolbar
          diffEditor={false}
          onOpenInEditor={props.onOpenInEditor}
          onCopy={() => handleCopy(props.value)}
          copied={copied}
          compact={compactToolbar}
          actions={toolbarActions}
        />
      ) : (
        <CopyButtonFloating
          className="open-in-editor-btn"
          variant="ghost"
          onClick={() => handleCopy(props.value)}
          title="Copy to clipboard"
        >
          {copied && <SuccessIcon size="1rem" weight="fill" />}
          <FileCopy size="16px" />
        </CopyButtonFloating>
      )}
      <div ref={contentRef}>
        <Highlighted
          code={props.value}
          language={language}
          grayedOutLines={props.grayedOutLines}
          scrollable={scrollable}
          $fontSize={fontSize}
          $lineHeight={lineHeight}
        />
      </div>
    </EditorWrapper>
  )
}
