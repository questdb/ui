import React from "react"
import { describe, expect, it, vi } from "vitest"
import type { Dispatch } from "redux"
import { runDetachedQuery } from "./runDetachedQuery"
import type { Client } from "./questdb/client"
import type { ExecutionRefs } from "../scenes/Editor/index"
import type { QueryAction } from "../store/Query/types"
import { NotificationType } from "../store/Query/types"
import { SESSION_ENDED_MESSAGE } from "../modules/OAuth2/session"

vi.mock("../components", () => ({ Text: "span" }))
vi.mock("../scenes/Editor/Monaco/query-in-notification", () => ({
  QueryInNotification: () => null,
}))
vi.mock("../scenes/Editor/QueryResult", () => ({ default: () => null }))

const run = async (failure: Record<string, unknown>) => {
  const dispatch = vi.fn()
  await runDetachedQuery({
    normalizedSQL: "insert into trades values (1)",
    queryKey: "insert into trades values (1)@0-0",
    namespaceKey: "conversation",
    quest: {
      queryRaw: () => ({ queryId: 1, promise: Promise.reject(failure) }),
    } as unknown as Client,
    dispatch: dispatch as Dispatch<QueryAction>,
    executionRefs: { current: {} } as React.MutableRefObject<ExecutionRefs>,
    releaseExecution: vi.fn(),
  })
  expect(dispatch).toHaveBeenCalledOnce()
  const [{ payload }] = dispatch.mock.calls[0] as [
    {
      payload: {
        type: NotificationType
        content: React.ReactElement<{ children: string }>
      }
    },
  ]
  expect(payload.type).toBe(NotificationType.ERROR)
  return payload.content.props.children
}

// The client's rejection for a request that the end of the session aborted.
const sessionEnded = {
  position: -1,
  query: "insert into trades values (1)",
  type: "error",
  error: SESSION_ENDED_MESSAGE,
  sessionEnded: true,
}

describe("runDetachedQuery failure notification", () => {
  // The notification outlives the session: the next login reads it.
  it("does not ask the next login to sign in for an interrupted query", async () => {
    expect(await run(sessionEnded)).toBe(
      "Interrupted when your previous session ended. The query may have executed; verify its outcome before running it again.",
    )
  })

  it("reports a query the session end stopped before it was executed", async () => {
    expect(await run({ ...sessionEnded, requestNotSent: true })).toBe(
      "Not executed: your previous session ended without running this query.",
    )
  })

  it("shows other errors as reported", async () => {
    expect(
      await run({
        position: 7,
        query: "insert into trades values (1)",
        type: "error",
        error: "table does not exist [table=trades]",
      }),
    ).toBe("table does not exist [table=trades]")
  })
})
