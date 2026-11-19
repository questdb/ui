import type { NotebookCell } from "../../store/notebook"
import type { ValidateQueryResult } from "../questdb/types"
import {
  checkStatementsForAutoRun,
  classifyStatements,
  type ClassifiedStatement,
} from "../tools/permissions"

// Which cells of an imported notebook get a first run, and which are held.
//
// An export carries each cell's run marker but never its rows, so without a
// run an imported grid cell shows its editor only, while the charts beside
// it already poll. The rule: a cell that was showing a result is run again
// when it is read-only (DQL, or a statement validate rejects as invalid,
// which the run reports without executing); a cell with DDL/DML is left as
// imported, and the user is told. A cell that could not be checked at all
// (the validate request failed) is held too, as the agent auto-run gate holds
// it, and the user is told why.

export type ImportRunPlan = {
  run: string[]
  // Classified as containing DDL/DML.
  held: string[]
  // Not classified: the validate request failed.
  unchecked: string[]
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
  const plan: ImportRunPlan = { run: [], held: [], unchecked: [] }
  for (const cell of cells) {
    if (!wanted.has(cell.id) || cell.value.trim() === "") continue
    let statements: ClassifiedStatement[]
    try {
      statements = await classifyStatements(cell.value, validate)
    } catch {
      plan.unchecked.push(cell.id)
      continue
    }
    if (checkStatementsForAutoRun(statements).action === "run") {
      plan.run.push(cell.id)
    } else {
      plan.held.push(cell.id)
    }
  }
  return plan
}

const cellCount = (count: number) => `${count} cell${count === 1 ? "" : "s"}`

const wasOrWere = (count: number) => (count === 1 ? "was" : "were")

export const heldCellsNote = (held: number): string =>
  `${cellCount(held)} containing DDL/DML ${wasOrWere(held)} not run automatically.`

export const uncheckedCellsNote = (unchecked: number): string =>
  `${cellCount(unchecked)} could not be checked for DDL/DML and ${wasOrWere(
    unchecked,
  )} not run automatically.`

// The import toast's note on cells that were not run, or "" when all ran.
export const importHoldNote = ({
  held,
  unchecked,
}: {
  held: number
  unchecked: number
}): string =>
  [
    held > 0 ? heldCellsNote(held) : "",
    unchecked > 0 ? uncheckedCellsNote(unchecked) : "",
  ]
    .filter(Boolean)
    .join(" ")
