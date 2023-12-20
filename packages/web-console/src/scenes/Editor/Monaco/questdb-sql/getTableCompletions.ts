import { Table } from "../../../../utils"
import { CompletionItemPriority } from "./types"
import { IRange } from "monaco-editor"
import { languages } from "monaco-editor"

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
      kind: languages.CompletionItemKind.Class,
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
