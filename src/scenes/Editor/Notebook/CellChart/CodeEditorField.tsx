import React from "react"
import styled, { useTheme } from "styled-components"
import { Editor as MonacoEditor } from "@monaco-editor/react"
import { getMonacoThemeName } from "../../../../utils/monacoInit"

const Frame = styled.div<{ $height: string; $invalid: boolean }>`
  height: ${({ $height }) => $height};
  border: 1px solid
    ${({ theme, $invalid }) =>
      $invalid ? theme.color.statusDanger : theme.color.interactionNeutral};
  border-radius: 0.4rem;
  overflow: hidden;
  background: ${({ theme }) => theme.color.editorCanvas};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderStrong};
    outline-offset: 1px;
  }
`

type Props = {
  value: string
  onChange: (value: string) => void
  language: "json"
  ariaLabel: string
  height?: string
  invalid?: boolean
}

/** A small Monaco editor for JSON inside a settings form. */
export const CodeEditorField: React.FC<Props> = ({
  value,
  onChange,
  language,
  ariaLabel,
  height = "28rem",
  invalid = false,
}) => {
  const theme = useTheme()
  return (
    <Frame
      $height={height}
      $invalid={invalid}
      data-hook="code-editor-field"
      // Escape leaves the editor by focusing its frame (see the drawer).
      tabIndex={-1}
    >
      <MonacoEditor
        value={value}
        language={language}
        theme={getMonacoThemeName(theme.mode)}
        onChange={(next) => onChange(next ?? "")}
        options={{
          ariaLabel,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "off",
          folding: true,
          wordWrap: "on",
          fontSize: 12,
          tabSize: 2,
          automaticLayout: true,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          padding: { top: 8, bottom: 8 },
          // A form around the editor scrolls past it.
          scrollbar: { alwaysConsumeMouseWheel: false },
        }}
      />
    </Frame>
  )
}
