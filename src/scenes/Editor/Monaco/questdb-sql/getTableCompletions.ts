import { Table } from "../../../../utils"
import { CompletionItemKind, CompletionItemPriority } from "./types"
import type { IRange } from "monaco-editor"

export const getTableCompletions = ({
  tables,
  range,
  priority,
  openQuote,
  nextCharQuote,
}: {
  tables: Table[]
  range: IRange
  priority: CompletionItemPriority
  openQuote: boolean
  nextCharQuote: boolean
}) => {
  return tables.map((item) => {
    return {
      label: item.table_name,
      kind: CompletionItemKind.Class,
      insertText: openQuote
        ? item.table_name + (nextCharQuote ? "" : '"')
        : /^[a-z0-9_]+$/i.test(item.table_name)
          ? item.table_name
          : `"${item.table_name}"`,
      sortText: priority,
      range,
    }
  })
}
