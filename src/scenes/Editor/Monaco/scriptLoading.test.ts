import "../../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../../modules/OAuth2/ssoAuthState"
import { questExecution } from "../../../utils/questdb/queryExecution"
import query, { initialState } from "../../../store/Query/reducers"
import actions from "../../../store/Query/actions"
import { NotificationType } from "../../../store/Query/types"
import { createScriptLoading } from "./scriptLoading"

afterEach(() => authSessionState.endSession())

describe("script loading settlement", () => {
  it("settles progress after session reset clears the request's abort target", () => {
    authSessionState.markNonSSOAuthenticated()
    let state = initialState
    const dispatch = (action: Parameters<typeof query>[1]) => {
      state = query(state, action)
    }
    const loading = createScriptLoading((id) =>
      dispatch(actions.settleActiveLoadingNotification(id)),
    )
    let abortTarget: number | null = 42
    loading.started(abortTarget)
    dispatch(
      actions.setActiveNotification({
        query: "script@0-0",
        queryId: abortTarget,
        type: NotificationType.LOADING,
        content: "Running query…",
        createdAt: new Date(),
      }),
    )
    questExecution.markActive(1, "script@0-0", () => {
      abortTarget = null
    })

    authSessionState.endSession()
    expect(abortTarget).toBeNull()
    dispatch(
      actions.addNotification(
        {
          query: "script@10-10",
          content: "Session ended",
          updateActiveNotification: false,
        },
        1,
      ),
    )
    loading.finish()
    dispatch(actions.stopRunning())

    expect(questExecution.getActive()).toBeNull()
    expect(state.activeNotification).toBeNull()
    expect(state.notifications).toHaveLength(1)
  })

  it("settles only the latest published statement and only once", () => {
    const settle = vi.fn()
    const loading = createScriptLoading(settle)
    loading.started(1)
    loading.started(2)
    loading.finish()
    loading.finish()
    expect(settle).toHaveBeenCalledOnce()
    expect(settle).toHaveBeenCalledWith(2)
  })

  it("does not clear newer active progress", () => {
    let state = query(
      initialState,
      actions.setActiveNotification({
        query: "new-script@0-0",
        queryId: 2,
        type: NotificationType.LOADING,
        content: "New run",
        createdAt: new Date(),
      }),
    )
    const loading = createScriptLoading((id) => {
      state = query(state, actions.settleActiveLoadingNotification(id))
    })
    loading.started(1)
    loading.finish()
    expect(state.activeNotification?.queryId).toBe(2)
  })
})
