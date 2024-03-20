import { IRange } from "monaco-editor"
import { languages } from "monaco-editor"
import { operators } from "./operators"
import { dataTypes, functions, keywords } from "@questdb/sql-grammar"

export const getLanguageCompletions = (range: IRange) => [
  ...functions.map((qdbFunction) => {
    return {
      label: qdbFunction,
      kind: languages.CompletionItemKind.Function,
      insertText: qdbFunction + "(${1})${2}",
      insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
      command: { id: "editor.action.triggerParameterHints" },
      range,
    }
  }),
  ...dataTypes.map((item) => {
    return {
      label: item,
      kind: languages.CompletionItemKind.Keyword,
      insertText: item,
      range,
    }
  }),
  ...keywords.map((item) => {
    const keyword = item.toUpperCase()
    return {
      label: keyword,
      kind: languages.CompletionItemKind.Keyword,
      insertText: keyword,
      range,
    }
  }),
  ...operators.map((item) => {
    const operator = item.toUpperCase()
    return {
      label: operator,
      kind: languages.CompletionItemKind.Operator,
      insertText: operator.toUpperCase(),
      range,
    }
  }),
]
