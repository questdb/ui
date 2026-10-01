import type { ColumnDefinition } from "../../../utils/questdb/types"
import { columnKindOf } from "./columnKind"

export const defaultIdentityColumns = (
  columns: ColumnDefinition[],
  designatedTimestamp: number,
): string[] => {
  const textColumns = columns
    .filter((column) => columnKindOf(column) === "text")
    .map((column) => column.name)
  if (textColumns.length > 0) return textColumns
  const timestamp = columns[designatedTimestamp]
  return timestamp ? [timestamp.name] : []
}
