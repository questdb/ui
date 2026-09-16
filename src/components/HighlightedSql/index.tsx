import React, { useEffect, useState } from "react"
import styled, { useTheme } from "styled-components"
import { applyMonacoTheme, monacoPromise } from "../../utils/monacoInit"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"

type Props = {
  code: string
  language?: string
  className?: string
  grayedOutLines?: [number, number] | null
}

const LINE_BREAK = "<br/>"
const NON_BREAKING_SPACE = /\u00a0/g

const Pre = styled.pre`
  white-space: pre-wrap;
  overflow-wrap: normal;
  word-break: normal;

  .grayed-out-line {
    opacity: 0.5;
  }
`

const grayOutLines = (html: string, [start, end]: [number, number]) =>
  html
    .split(LINE_BREAK)
    .map((line, index) =>
      index + 1 >= start && index + 1 <= end
        ? `<span class="grayed-out-line">${line}</span>`
        : line,
    )
    .join(LINE_BREAK)

export const HighlightedSql: React.FC<Props> = ({
  code,
  language = QuestDBLanguageName,
  className,
  grayedOutLines,
}) => {
  const theme = useTheme()
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void monacoPromise
      .then((monaco) => {
        // colorize bakes the active theme's colour-map indices into the markup,
        // and those indices differ between the two themes. This effect runs
        // before the provider re-applies the theme, so the mode this render is
        // for has to be set first; setTheme no-ops when it already matches.
        applyMonacoTheme(monaco, theme.mode)
        return monaco.editor.colorize(code, language, {})
      })
      .then((colorized) => {
        // colorize emits non-breaking spaces, which defeats pre-wrap.
        if (!cancelled) setHtml(colorized.replace(NON_BREAKING_SPACE, " "))
      })
    return () => {
      cancelled = true
    }
  }, [code, language, theme.mode])

  if (html === null) {
    return <Pre className={className}>{code}</Pre>
  }

  return (
    <Pre
      className={className}
      dangerouslySetInnerHTML={{
        __html: grayedOutLines ? grayOutLines(html, grayedOutLines) : html,
      }}
    />
  )
}
