import { describe, expect, it } from "vitest"
import {
  boundColumnProblem,
  mergePicks,
  pickLiteral,
  pickOf,
  pickOfParams,
  type PickSource,
} from "./selection"

const statement = (
  columns: [string, string][],
  rows: unknown[][],
): PickSource => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows,
})

// Trades as QuestDB sends them: LONG and DECIMAL as text, timestamps as ISO
// text, NULL as null.
const trades = statement(
  [
    ["desk", "SYMBOL"],
    ["id", "LONG"],
    ["price", "DECIMAL(10,2)"],
    ["ts", "TIMESTAMP"],
    ["qty", "DOUBLE"],
  ],
  [
    ["d1", "9007199254740993", "1.50", "2026-01-01T09:00:00.000000Z", 2],
    ["d1", "9007199254740993", "1.50", "2026-01-01T10:00:00.000000Z", 3],
    [null, "7", "2.25", "2026-01-01T11:00:00.000000Z", 4],
  ],
)

describe("pickLiteral", () => {
  it("writes the drawn column of a single row, typed by its column", () => {
    // Given / When / Then
    expect(pickLiteral(pickOf(0, [0], 0), undefined, [trades])).toBe("'d1'")
    expect(pickLiteral(pickOf(0, [0], 4), undefined, [trades])).toBe("2")
  })

  it("writes the bound column instead of the drawn one", () => {
    // Given a mark drawn from the desk column
    const pick = pickOf(0, [2], 0)

    // When / Then the bound column of its row is written
    expect(pickLiteral(pick, "qty", [trades])).toBe("4")
  })

  it("writes the value all rows of a mark agree on", () => {
    // Given a mark drawn from the first two rows
    const pick = pickOf(0, [0, 1], 0)

    // When / Then
    expect(pickLiteral(pick, undefined, [trades])).toBe("'d1'")
    expect(pickLiteral(pick, "id", [trades])).toBe("9007199254740993")
  })

  it("writes nothing when the rows of a mark disagree", () => {
    // Given a mark drawn from two rows with different times
    const pick = pickOf(0, [0, 1], 0)

    // When / Then
    expect(pickLiteral(pick, "ts", [trades])).toBeUndefined()
    expect(pickLiteral(pickOf(0, [1, 2], 0), undefined, [trades])).toBe(
      undefined,
    )
  })

  it("writes NULL for a NULL value", () => {
    expect(pickLiteral(pickOf(0, [2], 0), undefined, [trades])).toBe("null")
  })

  it("keeps a LONG past 2^53 exact and unquoted", () => {
    expect(pickLiteral(pickOf(0, [0], 1), undefined, [trades])).toBe(
      "9007199254740993",
    )
  })

  it("writes a DECIMAL as a decimal literal", () => {
    expect(pickLiteral(pickOf(0, [0], 2), undefined, [trades])).toBe("1.50m")
  })

  it("writes a TIMESTAMP as its quoted timestamp text", () => {
    expect(pickLiteral(pickOf(0, [1], 3), undefined, [trades])).toBe(
      "'2026-01-01T10:00:00.000000Z'",
    )
  })

  it("writes nothing without a column to write", () => {
    // Given a mark drawn from no column (an edge, a total)
    const edge = pickOf(0, [0])

    // When / Then: unbound, or bound to a column the statement lacks
    expect(pickLiteral(edge, undefined, [trades])).toBeUndefined()
    expect(pickLiteral(edge, "nope", [trades])).toBeUndefined()
    expect(pickLiteral(undefined, "desk", [trades])).toBeUndefined()
    expect(pickLiteral(pickOf(0, [], 0), undefined, [trades])).toBeUndefined()
  })

  it("writes nothing for rows or statements that are not there", () => {
    expect(pickLiteral(pickOf(0, [9], 0), undefined, [trades])).toBeUndefined()
    expect(pickLiteral(pickOf(1, [0], 0), undefined, [trades])).toBeUndefined()
    expect(pickLiteral(pickOf(0, [0], 0), undefined, [null])).toBeUndefined()
  })

  it("types the value by its own statement's column", () => {
    // Given two statements with a same-named column of different types
    const asText = statement([["id", "VARCHAR"]], [["42"]])
    const asLong = statement([["id", "LONG"]], [["42"]])

    // When / Then each pick is typed by its statement
    expect(pickLiteral(pickOf(0, [0]), "id", [asText, asLong])).toBe("'42'")
    expect(pickLiteral(pickOf(1, [0]), "id", [asText, asLong])).toBe("42")
  })
})

describe("mergePicks", () => {
  it("joins the rows of picks of one statement and column", () => {
    expect(mergePicks(pickOf(0, [1], 2), pickOf(0, [3], 2))).toEqual({
      statement: 0,
      rows: [1, 3],
      column: 2,
    })
    expect(mergePicks(undefined, pickOf(0, [3], 2))).toEqual(pickOf(0, [3], 2))
  })

  it("drops the drawn column, or the pick, when they differ", () => {
    expect(mergePicks(pickOf(0, [1], 2), pickOf(0, [3], 1))).toEqual({
      statement: 0,
      rows: [1, 3],
    })
    expect(mergePicks(pickOf(0, [1], 2), pickOf(1, [3], 2))).toBeUndefined()
  })
})

describe("pickOfParams", () => {
  it("reads the pick a clicked item carries", () => {
    expect(
      pickOfParams({
        data: { name: "d1", pick: { statement: 0, rows: [1], column: 0 } },
      }),
    ).toEqual(pickOf(0, [1], 0))
  })

  it("prefers the pick worked out for the click", () => {
    expect(
      pickOfParams({
        data: ["d1", 3],
        pick: { statement: 0, rows: [2], column: 0 },
      }),
    ).toEqual(pickOf(0, [2], 0))
  })

  it("never takes a label, a name or a value for a pick", () => {
    expect(pickOfParams({ data: { name: "d1", value: 3 } })).toBeUndefined()
    expect(pickOfParams({ data: ["d1", 3] })).toBeUndefined()
    expect(
      pickOfParams({ data: { pick: { statement: -1, rows: [0] } } }),
    ).toBeUndefined()
  })
})

describe("boundColumnProblem", () => {
  it("reports a bound column no statement returns", () => {
    expect(boundColumnProblem("nope", [null, trades])).toBe(
      'Click column "nope" not found.',
    )
    expect(boundColumnProblem("qty", [null, trades])).toBeUndefined()
    expect(boundColumnProblem(undefined, [trades])).toBeUndefined()
    expect(boundColumnProblem("nope", [null])).toBeUndefined()
  })
})
