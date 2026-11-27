// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
} from "./NotebookProvider"
import { useCellResultHydrationEngine } from "./resultHydration/CellResultHydrationContext"
import { QuestContext } from "../../../providers/QuestProvider"
import { questClient } from "../../../utils/questdb/queryClient"
import { QueryExecutionManager } from "../../../utils/questdb/queryExecutionManager"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import type { NotebookResultSnapshot } from "../../../store/notebookResults"
import {
  hasTransferSnapshot,
  markTransferSnapshotWritten,
  stageTransferSnapshot,
} from "../../../utils/notebooks/notebookTransferState"

const disk = vi.hoisted(() => ({
  indexRead: undefined as undefined | ((ids: string[]) => void),
  snapshotRead: undefined as
    | undefined
    | ((snapshot: NotebookResultSnapshot | undefined) => void),
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer: vi.fn(), activeBuffer: { id: 999 } }),
}))
vi.mock("../../../hooks/useQueryExecution", () => ({
  useQueryExecution: () => ({ executeSingle: vi.fn() }),
}))
vi.mock("./useNotebookPersistence", () => ({
  useNotebookPersistence: () => ({
    persistCells: vi.fn(),
    persistImmediately: () => Promise.resolve(),
    persistDebounced: vi.fn(),
  }),
}))
// The transfer's disk writes have not landed: both reads are held open.
vi.mock("../../../store/notebookResults", () => ({
  pinNotebookSnapshots: () => () => {},
  pruneToRecentNotebooks: () => Promise.resolve(undefined),
  loadSnapshotCellIds: () =>
    new Promise((resolve) => {
      disk.indexRead = resolve
    }),
  loadCellSnapshot: () =>
    new Promise((resolve) => {
      disk.snapshotRead = resolve
    }),
  deleteCellSnapshot: () => Promise.resolve(undefined),
  copyNotebookSnapshots: () => Promise.resolve(undefined),
}))

const frame: NotebookResultSnapshot = {
  bufferId: 42,
  cellId: "c1",
  savedAt: 123,
  results: [
    {
      type: "dql",
      query: "select 1",
      columns: [{ name: "x", type: "LONG" }],
      dataset: [[1]],
      count: 1,
      fetchedAt: 100,
    },
  ],
}

afterEach(() => {
  authSessionState.endSession()
  disk.indexRead = undefined
  disk.snapshotRead = undefined
})

let cells!: ReturnType<typeof useNotebookState>["cells"]
let actions!: ReturnType<typeof useNotebookActions>
let hydration: ReturnType<typeof useCellResultHydrationEngine>
const Probe = () => {
  cells = useNotebookState().cells
  actions = useNotebookActions()
  hydration = useCellResultHydrationEngine()
  return null
}
const mountNotebook = () =>
  renderComponent(
    <QuestContext.Provider
      value={{
        quest: questClient,
        questExecution: new QueryExecutionManager(),
        buildVersion: { type: "oss", version: "test" },
        commitHash: "test",
      }}
    >
      <NotebookProvider
        bufferId={42}
        initialState={{
          focusedCellId: "c1",
          cells: [
            {
              id: "c1",
              position: 0,
              value: "select 1",
              lastRunStatus: "success",
            },
          ],
        }}
      >
        <Probe />
      </NotebookProvider>
    </QuestContext.Provider>,
  )

describe("NotebookProvider transferred results", () => {
  it("keeps a transferred result a notebook opened mid-write is loading", async () => {
    authSessionState.markNonSSOAuthenticated()
    stageTransferSnapshot(frame)
    mountNotebook()
    // The focused cell takes the staged frame before the index read returns.
    await waitFor(() => expect(disk.snapshotRead).toBeDefined())
    // The index read lands first: the cell's write has not.
    await act(async () => {
      disk.indexRead?.([])
      await Promise.resolve()
    })
    act(() => {
      disk.snapshotRead?.(undefined)
    })
    await waitFor(() => expect(cells[0].result).toBeDefined())
    expect(cells[0].result?.results[0]).toMatchObject({ dataset: [[1]] })
  })

  it("keeps a transferred result for a remount before its disk write lands", async () => {
    authSessionState.markNonSSOAuthenticated()
    stageTransferSnapshot(frame)
    const first = mountNotebook()
    await waitFor(() => expect(disk.snapshotRead).toBeDefined())
    await act(async () => {
      disk.indexRead?.([])
      disk.snapshotRead?.(undefined)
      await Promise.resolve()
    })
    await waitFor(() => expect(cells[0].result).toBeDefined())
    // The user switches tabs away and back while the write is still pending.
    first.unmount()
    disk.indexRead = undefined
    disk.snapshotRead = undefined
    mountNotebook()
    await waitFor(() => expect(disk.snapshotRead).toBeDefined())
    await act(async () => {
      disk.indexRead?.([])
      disk.snapshotRead?.(undefined)
      await Promise.resolve()
    })
    await waitFor(() => expect(cells[0].result).toBeDefined())
    expect(cells[0].result?.results[0]).toMatchObject({ dataset: [[1]] })
  })

  it("discards the staged frame when the user closes a result before it is saved", async () => {
    authSessionState.markNonSSOAuthenticated()
    stageTransferSnapshot(frame)
    mountNotebook()
    await waitFor(() => expect(disk.snapshotRead).toBeDefined())
    await act(async () => {
      disk.indexRead?.([])
      disk.snapshotRead?.(undefined)
      await Promise.resolve()
    })
    expect(cells[0].result?.results[0]).toMatchObject({ dataset: [[1]] })

    act(() => actions.clearCellResult("c1"))

    expect(cells[0].result).toBeUndefined()
    expect(hasTransferSnapshot(42, "c1")).toBe(false)
  })

  it("does not bring back a written result whose snapshot was deleted since", async () => {
    authSessionState.markNonSSOAuthenticated()
    stageTransferSnapshot(frame)
    markTransferSnapshotWritten(42, "c1")
    mountNotebook()
    await waitFor(() => expect(disk.snapshotRead).toBeDefined())
    await act(async () => {
      disk.indexRead?.(["c1"])
      disk.snapshotRead?.(undefined)
      await Promise.resolve()
    })
    await waitFor(() => expect(hasTransferSnapshot(42, "c1")).toBe(false))
    expect(cells[0].result).toBeUndefined()
  })
})
