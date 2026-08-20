import React, { useEffect, useState } from "react"
import styled, { useTheme } from "styled-components"
import { applyMonacoTheme, monacoPromise } from "../../utils/monacoInit"
import { QuestDBLanguageName } from "../../scenes/Editor/Monaco/utils"

type Props = {
  code: string
  language?: string
  className?: string
}

const Pre = styled.pre`
  white-space: pre-wrap;
  overflow-wrap: normal;
  word-break: normal;
`

export const HighlightedSql: React.FC<Props> = ({
  code,
  language = QuestDBLanguageName,
  className,
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
        if (!cancelled) setHtml(colorized)
      })
    return () => {
      cancelled = true
    }
  }, [code, language, theme.mode])

  return html === null ? (
    <Pre className={className}>{code}</Pre>
  ) : (
    <Pre className={className} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
