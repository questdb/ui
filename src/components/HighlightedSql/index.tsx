import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { monacoPromise } from "../../utils/monacoInit"
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
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void monacoPromise
      .then((monaco) => monaco.editor.colorize(code, language, {}))
      .then((colorized) => {
        if (!cancelled) setHtml(colorized)
      })
    return () => {
      cancelled = true
    }
  }, [code, language])

  return html === null ? (
    <Pre className={className}>{code}</Pre>
  ) : (
    <Pre className={className} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
