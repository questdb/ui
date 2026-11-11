import type { NotebookCell } from "../../store/notebook"
import type { ValidateQueryResult } from "../questdb/types"
import { classifyAndCheckSqlForAutoRun } from "../tools/permissions"

// Which cells of an imported notebook get a first run, and which are held.
//
// An export carries each cell's run marker but never its rows, so without a
// run an imported grid cell shows its editor only, while the charts beside
// it already poll. The rule: a cell that was showing a result is run again
// when it is read-only (DQL); a cell with DDL/DML is left as imported, and
// the user is told.

export type ImportRunPlan = {
  run: string[]
  held: string[]
}

// Read before sanitising: the sanitiser drops the run marker on purpose.
// Chart cells are excluded here because the refresh engine starts them on
// its own, with its own write backstop.
export const cellsShowingResults = (rawCells: unknown): string[] => {
  if (!Array.isArray(rawCells)) return []
  return rawCells.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return []
    const cell = raw as Record<string, unknown>
    if (typeof cell.id !== "string") return []
    if (cell.type === "markdown" || cell.mode === "draw") return []
    const status = cell.lastRunStatus
    return typeof status === "string" && status !== "none" ? [cell.id] : []
  })
}

export const planImportRuns = async (
  cells: NotebookCell[],
  candidateIds: string[],
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<ImportRunPlan> => {
  const wanted = new Set(candidateIds)
  const plan: ImportRunPlan = { run: [], held: [] }
  for (const cell of cells) {
    if (!wanted.has(cell.id) || cell.value.trim() === "") continue
    const decision = await classifyAndCheckSqlForAutoRun(cell.value, validate)
    if (decision.action === "run") plan.run.push(cell.id)
    else plan.held.push(cell.id)
  }
  return plan
}

export const heldCellsNote = (held: number): string =>
  `${held} cell${held === 1 ? "" : "s"} containing DDL/DML ${
    held === 1 ? "was" : "were"
  } not run automatically.`
