import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { clearResultOnSessionEnd } from "./clearResultOnSessionEnd"
import queryReducer, { initialState } from "./Query/reducers"
import queryActions from "./Query/actions"
import type { QueryRawResult } from "../utils/questdb/types"
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

describe("clearResultOnSessionEnd", () => {
  it("clears the last query result when the session ends", () => {
    let state = queryReducer(initialState, queryActions.setResult(lastResult))
    const dispatch = vi.fn((action: Parameters<typeof queryReducer>[1]) => {
      state = queryReducer(state, action)
    })
    stop = clearResultOnSessionEnd(dispatch)
    authSessionState.markNonSSOAuthenticated()
    expect(dispatch).not.toHaveBeenCalled()

    authSessionState.endSession()

    expect(dispatch).toHaveBeenCalledOnce()
    expect(state.result).toBeUndefined()
  })

  it("stops when unsubscribed", () => {
    const dispatch = vi.fn()
    clearResultOnSessionEnd(dispatch)()

    authSessionState.endSession()

    expect(dispatch).not.toHaveBeenCalled()
  })
})
