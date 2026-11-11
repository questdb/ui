import { beforeEach, describe, expect, it } from "vitest"
import {
  cellsShowingResults,
  heldCellsNote,
  planImportRuns,
} from "./importRunPlan"
import { clearStatementClassCache } from "../tools/permissions"
import type { NotebookCell } from "../../store/notebook"
import type { ValidateQueryResult } from "../questdb/types"

const cell = (id: string, value: string): NotebookCell =>
  ({ id, value, position: 0 }) as NotebookCell

// A stand-in for /sql/validate: SELECTs are DQL, everything else is a write.
const validate = (sql: string): Promise<ValidateQueryResult> =>
  Promise.resolve(
    /^\s*select/i.test(sql)
      ? ({ queryType: "SELECT", columns: [] } as unknown as ValidateQueryResult)
      : ({ queryType: "INSERT" } as unknown as ValidateQueryResult),
  )

beforeEach(() => clearStatementClassCache())

describe("cellsShowingResults", () => {
  it("keeps SQL cells with a run marker and drops the rest", () => {
    expect(
      cellsShowingResults([
        { id: "ran", lastRunStatus: "success" },
        { id: "failed", lastRunStatus: "error" },
        { id: "never", lastRunStatus: "none" },
        { id: "fresh" },
        { id: "chart", mode: "draw", lastRunStatus: "success" },
        { id: "prose", type: "markdown", lastRunStatus: "success" },
        { noId: true, lastRunStatus: "success" },
        null,
      ]),
    ).toEqual(["ran", "failed"])
  })

  it("tolerates a missing or malformed cell list", () => {
    expect(cellsShowingResults(undefined)).toEqual([])
    expect(cellsShowingResults("cells")).toEqual([])
  })
})

describe("planImportRuns", () => {
  it("runs read-only candidates and holds the ones with DDL/DML", async () => {
    const plan = await planImportRuns(
      [
        cell("a", "select 1;"),
        cell("b", "select 2; insert into t values (1);"),
        cell("c", "create table x (ts timestamp);"),
        cell("d", "select 3;"),
        cell("e", "   "),
      ],
      ["a", "b", "c", "e"],
      validate,
    )
    expect(plan).toEqual({ run: ["a"], held: ["b", "c"] })
  })

  it("holds a cell whose statements cannot be classified", async () => {
    const plan = await planImportRuns([cell("a", "select 1;")], ["a"], () =>
      Promise.reject(new Error("offline")),
    )
    expect(plan).toEqual({ run: [], held: ["a"] })
  })
})

describe("heldCellsNote", () => {
  it("agrees in number", () => {
    expect(heldCellsNote(1)).toBe(
      "1 cell containing DDL/DML was not run automatically.",
    )
    expect(heldCellsNote(3)).toBe(
      "3 cells containing DDL/DML were not run automatically.",
    )
  })
})
