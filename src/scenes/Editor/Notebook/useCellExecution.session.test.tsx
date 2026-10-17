import "../../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCellExecution } from "./useCellExecution"
import { useCellsStore } from "./useCellsStore"
import {
  executeSingleRaw,
  type QueryExecResult,
} from "../../../utils/executeSingleRaw"
import { Client } from "../../../utils/questdb/client"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import { persistCellSnapshot } from "./persistCellSnapshot"
import {
  createNotebookController,
  type RunCellSummary,
} from "../../../utils/notebooks/notebookController/notebookController"
import { clearStatementClassCache } from "../../../utils/tools/permissions"
import type { CellResult } from "../../../store/notebook"
import type { ValidateQueryResult } from "../../../utils/questdb/types"

vi.mock("./persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  authSessionState.endSession()
  clearStatementClassCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

type ExecutionOptions = Parameters<typeof useCellExecution>[0]

const mountNotebook = (
  value: string,
  executeSingle: ExecutionOptions["executeSingle"],
  validateWithGlobals: ExecutionOptions["validateWithGlobals"] = (sql) =>
    Promise.resolve(
      sql.startsWith("insert")
        ? { queryType: "INSERT" }
        : { query: sql, columns: [], timestamp: -1 },
    ),
) => {
  const previous: CellResult = {
    results: [{ type: "dml", query: value }],
    activeResultIndex: 0,
    timestamp: 1,
  }
  let controller!: ReturnType<typeof createNotebookController>
  const LiveNotebook = () => {
    const store = useCellsStore({
      initialCells: [{ id: "cell", position: 0, value, result: previous }],
      persistCells: () => {},
      onCellsChange: () => {},
    })
    const execution = useCellExecution({
      bufferId: 1,
      cellsRef: store.cellsRef,
      executeSingle,
      validateWithGlobals,
      updateCellResult: store.updateCellResult,
      updateCell: store.updateCell,
      updateCells: store.updateCells,
      setScriptSummary: store.setScriptSummary,
      onSnapshotPersisted: vi.fn(),
    })
    controller = createNotebookController(1, {
      current: {
        runCell: execution.runCell,
        getCellsSnapshot: () => store.cellsRef.current,
        getSettings: () => ({}),
        getMaximizedCellId: () => null,
        applyTransition: (run) =>
          Promise.resolve(
            run({
              cells: store.cellsRef.current,
              settings: {},
              maximizedCellId: null,
              focusedCellId: null,
            }).result,
          ),
        flushChartSnapshots: () => Promise.resolve(),
        readRefreshState: () => new Map(),
        readResultStatus: () => "unrequested",
        noteResultMissing: () => {},
      },
    })
    return null
  }
  act(() => {
    renderer = create(<LiveNotebook />)
  })
  return controller
}

const expectNotStarted = (summary: RunCellSummary) => {
  expect(summary).toMatchObject({
    success: false,
    queryCount: 0,
    results: [],
    cancelled: "session_ended",
  })
  expect(summary.unverified).toBeUndefined()
  expect(summary.note).toContain("Run NOT started")
  expect(summary.note).toContain("Sign in again")
  expect(summary.note).not.toContain("Run completed")
  expect(persistCellSnapshot).not.toHaveBeenCalled()
}

describe("notebook execution session teardown", () => {
  it.each([false, true])(
    "reports a session ending during validation as not started (unmount=%s)",
    async (unmount) => {
      authSessionState.markNonSSOAuthenticated()
      const execute = vi.fn()
      let finishValidation!: (result: ValidateQueryResult) => void
      let validationStarted!: () => void
      const started = new Promise<void>((resolve) => {
        validationStarted = resolve
      })
      const controller = mountNotebook(
        "insert into validation_probe values (1)",
        execute,
        () => {
          validationStarted()
          return new Promise((resolve) => {
            finishValidation = resolve
          })
        },
      )
      const run = controller.runCell("cell", undefined, undefined, {
        kind: "explicit",
        permissions: { grantSchemaAccess: true, read: true, write: true },
      })
      await started
      authSessionState.endSession()
      // Do not flush passive teardown with act: the pending tool response can
      // escape before the MCP bridge is passively disposed.
      if (unmount) renderer!.update(<div>Sign in</div>)
      finishValidation({ queryType: "INSERT" })
      expectNotStarted(await run)
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["single", "select 1"],
    ["script", "insert into probe values (1); insert into probe values (2)"],
    ["parallel", "select 1; select 2"],
  ])(
    "preserves request-not-sent certainty from the %s execution wrapper",
    async (_strategy, sql) => {
      const client = new Client()
      const controller = mountNotebook(sql, (query, signal, limit) =>
        executeSingleRaw(client, query, [], signal, limit),
      )
      authSessionState.setAuthPayload({
        access_token: "old",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      client.refreshTokenMethod = () => {
        authSessionState.endSession()
        renderer!.update(<div>Sign in</div>)
        return Promise.resolve(undefined)
      }

      expectNotStarted(await controller.runCell("cell"))
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each(["script", "parallel"])(
    "keeps a %s run unverified if an earlier statement may have executed",
    async (strategy) => {
      authSessionState.markNonSSOAuthenticated()
      let finishSecond!: (result: QueryExecResult) => void
      let secondStarted!: () => void
      const started = new Promise<void>((resolve) => {
        secondStarted = resolve
      })
      let calls = 0
      const execute = vi.fn((query: string): Promise<QueryExecResult> => {
        if (calls++ === 0) {
          return Promise.resolve({
            type: "dml",
            query,
            columns: [],
            dataset: [],
            count: 1,
          })
        }
        secondStarted()
        return new Promise((resolve) => {
          finishSecond = resolve
        })
      })
      const controller = mountNotebook(
        strategy === "script"
          ? "insert into probe values (1); insert into probe values (2)"
          : "select 1; select 2",
        execute,
      )
      const run = controller.runCell("cell")
      await started
      authSessionState.endSession()
      finishSecond({
        type: "error",
        query: "second statement",
        columns: [],
        dataset: [],
        count: 0,
        error: "Session ended",
        requestNotSent: true,
        sessionEnded: true,
      })

      const summary = await run
      expect(summary.unverified).toBe(true)
      expect(summary.cancelled).toBe("session_ended")
      expect(summary.note).toContain(
        "Statements already sent may have executed",
      )
      expect(summary.note).not.toContain("Run NOT started")
      expect(persistCellSnapshot).not.toHaveBeenCalled()
    },
  )
})
