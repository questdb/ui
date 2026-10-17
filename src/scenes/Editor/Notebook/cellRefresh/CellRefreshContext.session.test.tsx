import "../../../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCellRefreshEngine } from "./CellRefreshContext"
import { useCellsStore } from "../useCellsStore"
import { Client } from "../../../../utils/questdb/client"
import { executeSingleRaw } from "../../../../utils/executeSingleRaw"
import { authSessionState } from "../../../../modules/OAuth2/ssoAuthState"
import { clearStatementClassCache } from "../../../../utils/tools/permissions"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import type { CellResult } from "../../../../store/notebook"

vi.mock("../persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))
vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: vi.fn().mockResolvedValue(undefined),
}))

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  vi.mocked(persistCellSnapshot).mockResolvedValue(true)
  vi.mocked(deleteCellSnapshot).mockResolvedValue(undefined)
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  clearStatementClassCache()
  authSessionState.endSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const mountNotebook = (draw: boolean) => {
  authSessionState.setAuthPayload({
    access_token: "old",
    refresh_token: "refresh",
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 20_000).toISOString(),
  })
  const client = new Client()
  const previous: CellResult = {
    results: [
      {
        type: "dql",
        query: "select 1",
        columns: [{ name: "value", type: "INT" }],
        dataset: [[42]],
        count: 1,
      },
    ],
    activeResultIndex: 0,
    timestamp: 1,
  }
  let engine!: ReturnType<typeof useCellRefreshEngine>
  let cellsRef!: ReturnType<typeof useCellsStore>["cellsRef"]
  const LiveNotebook = () => {
    const store = useCellsStore({
      initialCells: [
        {
          id: "cell",
          position: 0,
          value: "select 1",
          ...(draw ? { mode: "draw" as const } : {}),
          autoRefresh: false,
          result: previous,
        },
      ],
      persistCells: () => {},
      onCellsChange: () => {},
    })
    cellsRef = store.cellsRef
    engine = useCellRefreshEngine({
      bufferId: 1,
      cells: store.cells,
      deps: {
        executeSingle: (sql, signal, limit) =>
          executeSingleRaw(client, sql, [], signal, limit),
        validateWithGlobals: () =>
          Promise.resolve({
            query: "select 1",
            columns: [],
            timestamp: 0,
          }),
        setCellResult: (id, result) => store.updateCell(id, { result }),
        getCellResult: (id) =>
          store.cellsRef.current.find((cell) => cell.id === id)?.result,
        isDrawCell: (id) =>
          store.cellsRef.current.some(
            (cell) => cell.id === id && cell.mode === "draw",
          ),
        isCellRunning: () => false,
        resultLoadStatus: () => "loaded",
        subscribeResultLoad: () => () => {},
        requestResultLoad: () => {},
        noteResultMissing: () => {},
        reviveResultLoad: () => {},
        onSnapshotPersisted: () => {},
      },
    })
    return null
  }
  act(() => {
    renderer = create(<LiveNotebook />)
  })
  return { client, engine, previous, cellsRef }
}

describe("notebook refresh authentication sessions", () => {
  it.each([
    { draw: true, unmount: true },
    { draw: false, unmount: true },
    { draw: true, unmount: false },
    { draw: false, unmount: false },
  ])(
    "preserves results on refresh logout (draw=$draw, unmount=$unmount)",
    async ({ draw, unmount }) => {
      const { client, engine, previous, cellsRef } = mountNotebook(draw)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      client.refreshTokenMethod = () => {
        authSessionState.endSession()
        if (unmount) {
          // Do not use act: it flushes passive teardown and hides the race.
          renderer!.update(<div>Sign in</div>)
        }
        return Promise.resolve(undefined)
      }

      await engine.refresh("cell")

      expect(cellsRef.current[0].result).toBe(previous)
      expect(persistCellSnapshot).not.toHaveBeenCalled()
      expect(deleteCellSnapshot).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      if (!unmount) expect(engine.getState("cell")?.slotErrors.size).toBe(0)
    },
  )

  it.each([
    { draw: true, phase: "response" },
    { draw: false, phase: "response" },
    { draw: true, phase: "body" },
    { draw: false, phase: "body" },
  ])(
    "discards a delayed $phase after logout and re-login (draw=$draw)",
    async ({ draw, phase }) => {
      const { engine, previous, cellsRef } = mountNotebook(draw)
      authSessionState.setAuthPayload({
        access_token: "old",
        token_type: "Bearer",
      })
      let finish!: () => void
      let started!: () => void
      const requestStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      const body = JSON.stringify({
        columns: [{ name: "value", type: "INT" }],
        dataset: [[99]],
        count: 1,
      })
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          if (phase === "response") {
            return new Promise<Response>((resolve) => {
              finish = () => resolve(new Response(body))
              started()
            })
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              new Promise<string>((resolve) => {
                finish = () => resolve(body)
                started()
              }),
          } as Response)
        }),
      )

      const refresh = engine.refresh("cell")
      await requestStarted
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      finish()
      await refresh

      expect(cellsRef.current[0].result).toBe(previous)
      expect(persistCellSnapshot).not.toHaveBeenCalled()
      expect(deleteCellSnapshot).not.toHaveBeenCalled()
      expect(engine.getState("cell")?.slotErrors.size).toBe(0)
    },
  )

  it("retains the final snapshot without persisting it during layout teardown", async () => {
    const { engine, cellsRef } = mountNotebook(true)
    authSessionState.setAuthPayload({
      access_token: "old",
      token_type: "Bearer",
    })
    let value = 99
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              columns: [{ name: "value", type: "INT" }],
              dataset: [[value++]],
              count: 1,
            }),
          ),
        ),
      ),
    )
    await act(async () => {
      await engine.refresh("cell")
      await engine.refresh("cell")
    })
    const finalResults = cellsRef.current[0].result?.results
    expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

    // Observe layout cleanup separately: act would also flush passive effects.
    renderer!.update(<div>Another buffer</div>)

    expect(engine.getState("cell")).toBeUndefined()
    expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    act(() => renderer!.unmount())
    expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
    expect(vi.mocked(persistCellSnapshot).mock.calls[1][0].results).toBe(
      finalResults,
    )
  })

  it.each([true, false])(
    "still saves refreshes within the same session (draw=%s)",
    async (draw) => {
      const { client, engine, cellsRef } = mountNotebook(draw)
      client.refreshTokenMethod = () => {
        const refreshed = {
          access_token: "fresh",
          token_type: "Bearer",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        }
        authSessionState.setAuthPayload(refreshed)
        return Promise.resolve(refreshed)
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                columns: [{ name: "value", type: "INT" }],
                dataset: [[99]],
                count: 1,
              }),
            ),
          ),
        ),
      )

      await act(async () => {
        await engine.refresh("cell")
      })

      expect(cellsRef.current[0].result?.results[0]).toMatchObject({
        type: "dql",
        dataset: [[99]],
      })
      expect(persistCellSnapshot).toHaveBeenCalled()
      expect(deleteCellSnapshot).not.toHaveBeenCalled()
    },
  )
})
