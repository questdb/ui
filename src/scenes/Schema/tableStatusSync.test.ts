import { describe, it, expect, vi } from "vitest"
import {
  patchRowStatus,
  pickViewStatus,
  publishTableStatusUpdate,
  subscribeTableStatusUpdate,
  type TableStatusUpdate,
} from "./tableStatusSync"
import {
  getTableKind,
  type MaterializedView,
  type Table,
} from "../../utils/questdb/types"

const makeTable = (
  table_name: string,
  table_type: Table["table_type"],
  table_suspended = false,
): Table => ({ table_name, table_type, table_suspended }) as Table

const makeMatView = (
  view_name: string,
  view_status: MaterializedView["view_status"],
  invalidation_reason: string | null = null,
): MaterializedView =>
  ({ view_name, view_status, invalidation_reason }) as MaterializedView

const isMatViewTable = (name: string) => (row: Table) =>
  row.table_name === name && getTableKind(row) === "matview"

const isView = (name: string) => (row: MaterializedView) =>
  row.view_name === name

describe("pickViewStatus", () => {
  it("should pick only the status fields of a view row", () => {
    // Given
    const matView = {
      ...makeMatView("trades_1h", "retrying"),
      base_table_name: "trades",
    }

    // When
    const result = pickViewStatus(matView)

    // Then
    expect(result).toEqual({
      view_status: "retrying",
      invalidation_reason: null,
    })
  })

  it("should return undefined without a row", () => {
    expect(pickViewStatus(null)).toBeUndefined()
  })
})

describe("subscribeTableStatusUpdate", () => {
  const update: TableStatusUpdate = {
    tableName: "trades",
    kind: "table",
    table: { table_suspended: true },
  }

  it("should deliver published updates until unsubscribed", () => {
    // Given
    const handler = vi.fn()
    const unsubscribe = subscribeTableStatusUpdate(handler)

    // When
    publishTableStatusUpdate(update)
    unsubscribe()
    publishTableStatusUpdate(update)

    // Then
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(update)
  })

  it("should keep other subscribers when one unsubscribes", () => {
    // Given
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeTableStatusUpdate(first)
    const unsubscribeSecond = subscribeTableStatusUpdate(second)

    // When
    unsubscribeFirst()
    publishTableStatusUpdate(update)
    unsubscribeSecond()

    // Then
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})

describe("patchRowStatus", () => {
  it("should update only the target row", () => {
    // Given
    const tables = [makeTable("trades", "T"), makeTable("trades_1h", "M")]

    // When
    const result = patchRowStatus(tables, isMatViewTable("trades_1h"), {
      table_suspended: true,
    })

    // Then
    expect(result[0]).toBe(tables[0])
    expect(result[1].table_suspended).toBe(true)
  })

  it("should ignore a row with the same name but another kind", () => {
    // Given
    const tables = [makeTable("trades", "T")]

    // When
    const result = patchRowStatus(tables, isMatViewTable("trades"), {
      table_suspended: true,
    })

    // Then
    expect(result).toBe(tables)
  })

  it("should clear the invalidation when the view becomes valid again", () => {
    // Given
    const matViews = [makeMatView("trades_1h", "invalid", "base table dropped")]

    // When
    const result = patchRowStatus(matViews, isView("trades_1h"), {
      view_status: "valid",
      invalidation_reason: null,
    })

    // Then
    expect(result[0].view_status).toBe("valid")
    expect(result[0].invalidation_reason).toBeNull()
  })

  it("should keep the same array without a status or a matching row", () => {
    // Given
    const matViews = [makeMatView("trades_1h", "valid")]

    // When
    const withoutStatus = patchRowStatus(
      matViews,
      isView("trades_1h"),
      undefined,
    )
    const withoutRow = patchRowStatus(matViews, isView("other"), {
      view_status: "invalid",
      invalidation_reason: "x",
    })

    // Then
    expect(withoutStatus).toBe(matViews)
    expect(withoutRow).toBe(matViews)
  })

  it("should keep the same array when the status did not change", () => {
    // Given
    const matViews = [makeMatView("trades_1h", "retrying")]

    // When
    const result = patchRowStatus(matViews, isView("trades_1h"), {
      view_status: "retrying",
      invalidation_reason: null,
    })

    // Then
    expect(result).toBe(matViews)
  })
})
