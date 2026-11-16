import {
  declaresBufferId,
  createsNotebook,
  mcpTools,
} from "../../utils/tools/tools"
import type { McpToolResultLike } from "./mcpToolEvents"

const CELL_TOOLS = new Set(
  mcpTools
    .filter((tool) => tool.inputSchema.properties.cell_id !== undefined)
    .map((tool) => tool.name),
)

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const notebookIdOf = (id: unknown): number | undefined =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : undefined
const cellIdOf = (id: unknown): string | undefined =>
  typeof id === "string" && id.length > 0 && id.length <= 512 ? id : undefined

const executionOutcome = (output: Record<string, unknown>): string => {
  if (output.skipped) {
    return "skipped"
  }

  if (output.cancelled) {
    return "cancelled"
  }

  if (output.unverified) {
    return "unverified"
  }

  if (output.success === true || output.ran === true) {
    return "success"
  }

  if (output.success === false || output.ran === false) {
    return "error"
  }

  return "unknown"
}

// Call before MCP appends permission notices / user-action digests. Extract
// only identifiers and controlled outcome fields, never SQL, names or errors.
export const mcpNotebookTelemetry = (
  name: string,
  input: unknown,
  result?: McpToolResultLike,
): Record<string, unknown> => {
  if (!declaresBufferId(name) && !createsNotebook(name)) return {}
  const args = record(input)
  const payload: Record<string, unknown> = {}
  const target = declaresBufferId(name)
    ? notebookIdOf(args.buffer_id)
    : undefined
  if (target !== undefined)
    payload[name === "duplicate_notebook" ? "sourceNotebookId" : "notebookId"] =
      target
  const cellId = CELL_TOOLS.has(name) ? cellIdOf(args.cell_id) : undefined
  if (cellId !== undefined) payload.cellId = cellId
  if (!result || result.isError) return payload
  let output: Record<string, unknown> = {}
  try {
    const text = result.content.find((c) => c.type === "text")?.text
    if (text) output = record(JSON.parse(text))
  } catch {
    return payload
  }
  if (createsNotebook(name)) {
    const createdId = notebookIdOf(output.bufferId)
    if (createdId !== undefined) payload.notebookId = createdId
  }
  if (name === "add_cell" || name === "duplicate_cell") {
    const createdId = cellIdOf(output.cellId)
    if (createdId !== undefined)
      payload[name === "duplicate_cell" ? "newCellId" : "cellId"] = createdId
  }
  if (name === "run_cell" || (name === "add_cell" && args.run === true))
    payload.executionOutcome = executionOutcome(output)
  if (name === "apply_notebook_state" && Array.isArray(output.runs))
    payload.cellExecutions = output.runs
      .slice(0, 200)
      .flatMap((run: unknown) => {
        const item = record(run)
        const id = cellIdOf(item.cellId)
        return id === undefined
          ? []
          : [{ cellId: id, outcome: executionOutcome(item) }]
      })
  return payload
}
