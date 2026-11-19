// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { NotebookProvider, useNotebookState } from "./NotebookProvider"
import { QuestContext } from "../../../providers/QuestProvider"
import { questClient } from "../../../utils/questdb/queryClient"
import { QueryExecutionManager } from "../../../utils/questdb/queryExecutionManager"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import type { NotebookResultSnapshot } from "../../../store/notebookResults"
import { stageTransferSnapshot } from "../../../utils/notebooks/notebookTransferState"

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
    persistImmediately: vi.fn(),
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

afterEach(() => authSessionState.endSession())

describe("NotebookProvider transferred results", () => {
  it("keeps a transferred result a notebook opened mid-write is loading", async () => {
    authSessionState.markNonSSOAuthenticated()
    stageTransferSnapshot(frame)
    let cells!: ReturnType<typeof useNotebookState>["cells"]
    const Probe = () => {
      cells = useNotebookState().cells
      return null
    }
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
})
