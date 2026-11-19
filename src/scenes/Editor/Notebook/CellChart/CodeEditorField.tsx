import React from "react"
import styled, { useTheme } from "styled-components"
import { Editor as MonacoEditor, type Monaco } from "@monaco-editor/react"
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

const Hint = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

// JavaScript highlighting without Monaco's TypeScript service (megabytes,
// not shipped): a language of our own with Monaco's JavaScript tokens.
export const JAVASCRIPT_TOKENS_ID = "qdb-javascript"
let javascriptRegistered = false
const registerJavascript = (monaco: Monaco) => {
  if (javascriptRegistered) return
  javascriptRegistered = true
  monaco.languages.register({ id: JAVASCRIPT_TOKENS_ID })
  const amdRequire = (
    window as unknown as {
      require?: (
        deps: string[],
        done: (module: {
          language: Parameters<
            Monaco["languages"]["setMonarchTokensProvider"]
          >[1]
          conf: Parameters<Monaco["languages"]["setLanguageConfiguration"]>[1]
        }) => void,
      ) => void
    }
  ).require
  amdRequire?.(["vs/basic-languages/javascript/javascript"], (module) => {
    monaco.languages.setMonarchTokensProvider(
      JAVASCRIPT_TOKENS_ID,
      module.language,
    )
    monaco.languages.setLanguageConfiguration(JAVASCRIPT_TOKENS_ID, module.conf)
  })
}

type Props = {
  value: string
  onChange: (value: string) => void
  language: "json" | "javascript"
  ariaLabel: string
  height?: string
  invalid?: boolean
}

/** A small Monaco editor for JSON or JavaScript inside a settings form. */
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
    <Wrapper>
      <Frame
        $height={height}
        $invalid={invalid}
        data-hook="code-editor-field"
        // Escape leaves the editor by focusing its frame (see the drawer).
        tabIndex={-1}
      >
        <MonacoEditor
          value={value}
          language={language === "javascript" ? JAVASCRIPT_TOKENS_ID : language}
          beforeMount={
            language === "javascript" ? registerJavascript : undefined
          }
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
      <Hint>Esc leaves the editor; Tab indents.</Hint>
    </Wrapper>
  )
}
