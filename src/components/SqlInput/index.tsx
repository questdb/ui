import React, { useEffect, useRef, useState } from "react"
import styled, { useTheme } from "styled-components"
import { Editor } from "@monaco-editor/react"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"
import type { ThemeMode } from "../../types"
import {
  getMonacoThemeClassName,
  getMonacoThemeName,
  monacoPromise,
} from "../../utils/monacoInit"

const LINE_HEIGHT_PX = 21
const VERTICAL_PADDING_PX = 8
const OVERFLOW_WIDGETS_Z_INDEX = 10000

const useOverflowWidgetsNode = (mode: ThemeMode) => {
  const [node] = useState(() => {
    const element = document.createElement("div")
    element.style.position = "fixed"
    element.style.top = "0"
    element.style.left = "0"
    element.style.zIndex = String(OVERFLOW_WIDGETS_Z_INDEX)
    return element
  })

  useEffect(() => {
    document.body.appendChild(node)
    return () => node.remove()
  }, [node])

  useEffect(() => {
    node.className = `monaco-editor ${getMonacoThemeClassName(mode)}`
  }, [node, mode])

  return node
}

const Root = styled.div<{ $invalid: boolean }>`
  position: relative;
  border: 1px solid
    ${({ $invalid, theme }) =>
      $invalid ? theme.color.statusDanger : theme.color.borderDefault};
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.editorCanvas};
  overflow: hidden;
  transition: border-color 120ms ease;

  &:focus-within {
    border-color: ${({ $invalid, theme }) =>
      $invalid ? theme.color.statusDanger : theme.color.borderAccent};
  }
`

const Placeholder = styled.span`
  position: absolute;
  top: ${VERTICAL_PADDING_PX}px;
  left: 1.2rem;
  color: ${({ theme }) => theme.color.contentMuted};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  line-height: ${LINE_HEIGHT_PX}px;
  pointer-events: none;
  user-select: none;
`

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minLines?: number
  invalid?: boolean
  ariaLabel?: string
  dataHook?: string
  onSubmit?: () => void
}

export const SqlInput = ({
  value,
  onChange,
  placeholder,
  minLines = 4,
  invalid = false,
  ariaLabel,
  dataHook,
  onSubmit,
}: Props) => {
  const theme = useTheme()
  const [ready, setReady] = useState(false)
  const onSubmitRef = useRef(onSubmit)
  const overflowWidgetsNode = useOverflowWidgetsNode(theme.mode)
  const height = `${minLines * LINE_HEIGHT_PX + VERTICAL_PADDING_PX * 2}px`

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    let cancelled = false
    void monacoPromise.then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Root $invalid={invalid} data-hook={dataHook} style={{ height }}>
      {placeholder && value === "" && <Placeholder>{placeholder}</Placeholder>}
      {ready && (
        <Editor
          value={value}
          language={QuestDBLanguageName}
          theme={getMonacoThemeName(theme.mode)}
          loading={null}
          onChange={(next) => onChange(next ?? "")}
          onMount={(editor, monaco) =>
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
              () => onSubmitRef.current?.(),
            )
          }
          options={{
            ariaLabel,
            useShadowDOM: false,
            automaticLayout: true,
            minimap: { enabled: false },
            lineNumbers: "off",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 0,
            renderLineHighlight: "none",
            overviewRulerLanes: 0,
            occurrencesHighlight: "off",
            stickyScroll: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            fontSize: 13,
            lineHeight: LINE_HEIGHT_PX,
            padding: { top: VERTICAL_PADDING_PX, bottom: VERTICAL_PADDING_PX },
            scrollbar: {
              useShadows: false,
              verticalScrollbarSize: 8,
              alwaysConsumeMouseWheel: false,
            },
            fixedOverflowWidgets: true,
            overflowWidgetsDomNode: overflowWidgetsNode,
          }}
        />
      )}
    </Root>
  )
}
