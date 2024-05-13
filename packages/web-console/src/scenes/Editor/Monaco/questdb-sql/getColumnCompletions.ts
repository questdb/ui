import { uniq } from "../../../../utils"
import {
  CompletionItemKind,
  CompletionItemPriority,
  InformationSchemaColumn,
} from "./types"
import type { IRange } from "monaco-editor"

export const getColumnCompletions = ({
  columns,
  range,
  withTableName,
  priority,
}: {
  columns: InformationSchemaColumn[]
  range: IRange
  withTableName: boolean
  priority: CompletionItemPriority
}) => {
  // For JOIN ON ... completions, return `table.column` text
  if (withTableName) {
    return columns.map((item) => ({
      label: {
        label: `${item.table_name}.${item.column_name}`,
        detail: "",
        description: item.data_type,
      },
      kind: CompletionItemKind.Enum,
      insertText: `${item.table_name}.${item.column_name}`,
      sortText: priority,
      range,
    }))
    // For everything else, return a list of unique column names.
  } else {
    return uniq(columns.map((item) => item.column_name)).map((columnName) => {
      const tableNames = columns
        .filter((item) => item.column_name === columnName)
        .map((item) => item.table_name)
      return {
        label: {
          label: columnName,
          detail: ` (${tableNames.sort().join(", ")})`,
          // If the column is present in multiple tables, show their list here, otherwise return the column type.
          description:
            tableNames.length > 1
              ? ""
              : columns.find((item) => item.column_name === columnName)
                  ?.data_type,
        },
        kind: CompletionItemKind.Enum,
        insertText: columnName,
        sortText: priority,
        range,
      }
    })
  }
}
