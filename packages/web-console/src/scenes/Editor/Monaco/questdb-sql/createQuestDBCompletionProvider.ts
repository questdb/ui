import * as monaco from "monaco-editor"
import { operators } from "./operators"
import { languages } from "monaco-editor"
import { dataTypes, functions, keywords } from "@questdb/sql-grammar"

export const createQuestDBCompletionProvider = () => {
  const completionProvider: monaco.languages.CompletionItemProvider = {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: [
          ...functions.map((qdbFunction) => {
            return {
              label: qdbFunction,
              kind: languages.CompletionItemKind.Function,
              insertText: qdbFunction,
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
        ],
      }
    },
  }

  return completionProvider
}
