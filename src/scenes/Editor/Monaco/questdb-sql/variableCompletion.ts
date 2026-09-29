import type { editor, IRange, languages } from "monaco-editor"
import { SuggestionKind, type Suggestion } from "@questdb/sql-parser"
import { CompletionItemKind, CompletionItemPriority } from "./types"

export type VariableSuggestion = {
  name: string
  value?: string
  description?: string
}

type VariableSuggestionGetter = () => VariableSuggestion[]

const VALUE_PREVIEW_MAX = 60

const SUBSTITUTABLE_KINDS = new Set([
  SuggestionKind.Table,
  SuggestionKind.Column,
])

const getters = new WeakMap<editor.ITextModel, VariableSuggestionGetter>()

export const registerVariableModel = (
  model: editor.ITextModel,
  getter: VariableSuggestionGetter,
): (() => void) => {
  getters.set(model, getter)
  return () => {
    getters.delete(model)
  }
}

export const variableSuggestionsFor = (
  model: editor.ITextModel,
): VariableSuggestion[] => getters.get(model)?.() ?? []

export const variableReferenceRange = (
  model: editor.ITextModel,
  position: { lineNumber: number; column: number },
): IRange | null => {
  const word = model.getWordUntilPosition(position)
  const line = model.getLineContent(position.lineNumber)
  const atColumn = word.startColumn - 1
  if (atColumn < 1 || line[atColumn - 1] !== "@") return null
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: atColumn,
    endColumn: word.endColumn,
  }
}

const previewValue = (value: string | undefined): string => {
  if (value === undefined) return "no value"
  const single = value.replace(/\s+/g, " ").trim()
  return single.length > VALUE_PREVIEW_MAX
    ? `${single.slice(0, VALUE_PREVIEW_MAX - 3)}...`
    : single
}

const bareValue = (value: string): string => {
  const trimmed = value.trim()
  const quote = trimmed[0]
  return trimmed.length > 1 &&
    (quote === "'" || quote === '"') &&
    trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed
}

const variableItem = (
  variable: VariableSuggestion,
  detail: string,
  filterText: string,
  sortText: string,
  range: IRange,
): languages.CompletionItem => ({
  label: {
    label: `@${variable.name}`,
    detail: `  ${detail}`,
    description: variable.description,
  },
  kind: CompletionItemKind.Variable,
  insertText: `@${variable.name} `,
  filterText,
  sortText,
  range,
})

export const variableItems = (
  variables: VariableSuggestion[],
  range: IRange,
): languages.CompletionItem[] =>
  variables.map((variable) =>
    variableItem(
      variable,
      previewValue(variable.value),
      `@${variable.name}`,
      CompletionItemPriority.High + variable.name.toLowerCase(),
      range,
    ),
  )

export const substitutionItems = (
  variables: VariableSuggestion[],
  suggestion: Suggestion,
  targetSortText: string,
  range: IRange,
): languages.CompletionItem[] => {
  if (!SUBSTITUTABLE_KINDS.has(suggestion.kind)) return []
  const target = suggestion.insertText.toLowerCase()
  return variables
    .filter(
      (variable) =>
        variable.value !== undefined &&
        bareValue(variable.value).toLowerCase() === target,
    )
    .map((variable) =>
      variableItem(
        variable,
        suggestion.insertText,
        suggestion.insertText,
        `${targetSortText} `,
        range,
      ),
    )
}
