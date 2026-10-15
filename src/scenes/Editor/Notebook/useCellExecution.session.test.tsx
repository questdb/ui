import "../../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCellExecution } from "./useCellExecution"
import { useCellsStore } from "./useCellsStore"
import { executeSingleRaw } from "../../../utils/executeSingleRaw"
import { Client } from "../../../utils/questdb/client"
import { ssoAuthState } from "../../../modules/OAuth2/ssoAuthState"
import { persistCellSnapshot } from "./persistCellSnapshot"
import type { CellResult } from "../../../store/notebook"

vi.mock("./persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  ssoAuthState.clearAuthPayload()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("notebook execution session teardown", () => {
  it.each([false, true])(
    "does not persist a session-ended error (unmount=%s)",
    async (unmount) => {
      const client = new Client()
      const previous: CellResult = {
        results: [{ type: "dml", query: "select 1" }],
        activeResultIndex: 0,
        timestamp: 1,
      }
      let execution: ReturnType<typeof useCellExecution>
      const LiveNotebook = () => {
        const store = useCellsStore({
          initialCells: [
            { id: "cell", position: 0, value: "select 1", result: previous },
          ],
          persistCells: () => {},
          onCellsChange: () => {},
        })
        execution = useCellExecution({
          bufferId: 1,
          cellsRef: store.cellsRef,
          executeSingle: (sql, signal, limit) =>
            executeSingleRaw(client, sql, [], signal, limit),
          validateWithGlobals: vi.fn(),
          updateCellResult: store.updateCellResult,
          updateCell: store.updateCell,
          updateCells: store.updateCells,
          setScriptSummary: store.setScriptSummary,
          onSnapshotPersisted: vi.fn(),
        })
        return null
      }
      act(() => {
        renderer = create(<LiveNotebook />)
      })
      ssoAuthState.setAuthPayload({
        access_token: "old",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      client.refreshTokenMethod = () => {
        ssoAuthState.clearAuthPayload()
        // Do not use act here: it would flush passive teardown and hide the race.
        if (unmount) renderer!.update(<div>Sign in</div>)
        return Promise.resolve(undefined)
      }

      const outcome = await execution!.runCell("cell")

      expect(outcome.superseded).toBe(true)
      expect(persistCellSnapshot).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})
