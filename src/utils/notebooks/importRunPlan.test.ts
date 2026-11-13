import { beforeEach, describe, expect, it } from "vitest"
import {
  cellsShowingResults,
  heldCellsNote,
  importHoldNote,
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
    expect(plan).toEqual({ run: ["a"], held: ["b", "c"], unchecked: [] })
  })

  it("runs a cell whose statement validate rejects as invalid", async () => {
    // Given a DQL statement next to one the server reports as invalid
    const plan = await planImportRuns(
      [cell("a", "select 1; selec 2;")],
      ["a"],
      (sql) =>
        /^\s*selec\s/i.test(sql)
          ? Promise.resolve({
              error: "Invalid column",
              position: 0,
            } as unknown as ValidateQueryResult)
          : validate(sql),
    )
    // Then it runs, as the auto-run gate lets it: the invalid statement is
    // reported by the run, never executed
    expect(plan).toEqual({ run: ["a"], held: [], unchecked: [] })
  })

  it("holds a cell that could not be checked, apart from DDL/DML", async () => {
    // Given the validate request fails (server unreachable, 5xx, 401)
    const plan = await planImportRuns(
      [cell("a", "select 1;"), cell("b", "select 2; select 3;")],
      ["a", "b"],
      () => Promise.reject(new Error("offline")),
    )
    // Then the cells are held as unchecked, not as DDL/DML
    expect(plan).toEqual({ run: [], held: [], unchecked: ["a", "b"] })
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

describe("importHoldNote", () => {
  it("names DDL/DML and unchecked cells separately", () => {
    expect(importHoldNote({ held: 0, unchecked: 0 })).toBe("")
    expect(importHoldNote({ held: 2, unchecked: 0 })).toBe(
      "2 cells containing DDL/DML were not run automatically.",
    )
    expect(importHoldNote({ held: 0, unchecked: 1 })).toBe(
      "1 cell could not be checked for DDL/DML and was not run automatically.",
    )
    expect(importHoldNote({ held: 1, unchecked: 3 })).toBe(
      "1 cell containing DDL/DML was not run automatically. " +
        "3 cells could not be checked for DDL/DML and were not run automatically.",
    )
  })
})
