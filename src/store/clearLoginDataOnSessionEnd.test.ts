import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { clearLoginDataOnSessionEnd } from "./clearLoginDataOnSessionEnd"
import queryReducer, { initialState } from "./Query/reducers"
import queryActions from "./Query/actions"
import type {
  InformationSchemaColumn,
  QueryRawResult,
  Table,
} from "../utils/questdb/types"
import { Type } from "../utils/questdb/types"

let stop: (() => void) | undefined

afterEach(() => {
  stop?.()
  stop = undefined
  authSessionState.endSession()
})

const lastResult = {
  type: Type.DQL,
  query: "select * from payroll",
  columns: [{ name: "salary", type: "INT" }],
  dataset: [[1000]],
  count: 1,
  timings: { compiler: 0, count: 0, execute: 0, fetch: 0 },
} as unknown as QueryRawResult

const payroll = { table_name: "payroll" } as Table
const salary: InformationSchemaColumn = {
  table_name: "payroll",
  ordinal_position: 1,
  column_name: "salary",
  data_type: "INT",
}

describe("clearLoginDataOnSessionEnd", () => {
  it("clears the last query result and the schema when the session ends, but keeps the query log", () => {
    // Given what a login read: a result, the schema, and the query's outcome
    let state = [
      queryActions.setResult(lastResult),
      queryActions.setTables([payroll]),
      queryActions.setColumns([salary]),
      queryActions.addNotification(
        { query: "select * from payroll@0-0", content: "1 row" },
        1,
      ),
    ].reduce(queryReducer, initialState)
    const dispatch = vi.fn((action: Parameters<typeof queryReducer>[1]) => {
      state = queryReducer(state, action)
    })
    stop = clearLoginDataOnSessionEnd(dispatch)
    authSessionState.markNonSSOAuthenticated()
    expect(dispatch).not.toHaveBeenCalled()

    // When the session ends
    authSessionState.endSession()

    // Then whoever signs in next sees none of the data, as in a new console
    expect(state.result).toBeUndefined()
    expect(state.tables).toEqual(initialState.tables)
    expect(state.columns).toEqual(initialState.columns)
    // And the log still reports what the end of the session interrupted
    expect(state.notifications).toHaveLength(1)
  })

  it("leaves the store to the reload when logging out reloads the page", () => {
    // Given what a login read, on screen in the console
    let state = [
      queryActions.setResult(lastResult),
      queryActions.setTables([payroll]),
      queryActions.setColumns([salary]),
    ].reduce(queryReducer, initialState)
    const dispatch = vi.fn((action: Parameters<typeof queryReducer>[1]) => {
      state = queryReducer(state, action)
    })
    stop = clearLoginDataOnSessionEnd(dispatch)
    authSessionState.markNonSSOAuthenticated()

    // When logging out from the toolbar reloads the page
    authSessionState.endSession({ reload: true })

    // Then the console keeps showing it until the new document replaces it
    expect(dispatch).not.toHaveBeenCalled()
    expect(state.result).toBe(lastResult)
    expect(state.tables).toEqual([payroll])
  })

  it("stops when unsubscribed", () => {
    const dispatch = vi.fn()
    clearLoginDataOnSessionEnd(dispatch)()

    authSessionState.endSession()

    expect(dispatch).not.toHaveBeenCalled()
  })
})
