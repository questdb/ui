import { operators } from "./operators"
import { dataTypes, functions, keywords } from "@questdb/sql-grammar"
import { CompletionItemKind } from "./types"
import type { IRange } from "monaco-editor"

export const getLanguageCompletions = (range: IRange) => [
  ...functions.map((qdbFunction) => {
    return {
      label: qdbFunction,
      kind: CompletionItemKind.Function,
      insertText: qdbFunction,
      range,
    }
  }),
  ...dataTypes.map((item) => {
    return {
      label: item,
      kind: CompletionItemKind.Keyword,
      insertText: item,
      range,
    }
  }),
  ...keywords.map((item) => {
    const keyword = item.toUpperCase()
    return {
      label: keyword,
      kind: CompletionItemKind.Keyword,
      insertText: keyword,
      range,
    }
  }),
  ...operators.map((item) => {
    const operator = item.toUpperCase()
    return {
      label: operator,
      kind: CompletionItemKind.Operator,
      insertText: operator.toUpperCase(),
      range,
    }
  }),
]
