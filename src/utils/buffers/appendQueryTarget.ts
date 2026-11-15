import { BufferType, bufferTypeOf } from "../../store/buffers"
import type { Buffer } from "../../store/buffers"

// Where a query sent to the editor from outside it (schema actions, Import
// DDL) lands. A previewed closed tab is read-only, so instead of being
// silently dropped the query opens in a new tab and the preview is untouched.
export type AppendQueryTarget =
  | "editor"
  | "notebook-cell"
  | "new-notebook"
  | "new-sql-tab"

export const appendQueryTarget = (
  buffer: Pick<
    Buffer,
    "isTemporary" | "notebookViewState" | "metricsViewState"
  >,
): AppendQueryTarget => {
  const bufferType = bufferTypeOf(buffer)
  if (bufferType === BufferType.METRICS) return "new-notebook"
  if (bufferType === BufferType.NOTEBOOK) {
    return buffer.isTemporary ? "new-notebook" : "notebook-cell"
  }
  return buffer.isTemporary ? "new-sql-tab" : "editor"
}
