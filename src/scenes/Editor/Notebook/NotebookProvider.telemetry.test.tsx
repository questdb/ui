// @vitest-environment jsdom
import React, { useRef } from "react"
import { Button } from "../../../components/Button"
import type { CellResult } from "../../../store/notebook"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
  type NotebookActions,
} from "./NotebookProvider"
import { useCellRunActions } from "./cells/useCellRunActions"
import { QuestContext } from "../../../providers/QuestProvider"
import { questClient } from "../../../utils/questdb/queryClient"
import { QueryExecutionManager } from "../../../utils/questdb/queryExecutionManager"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import type { CellRunOutcome } from "./notebookUtils"
import type { RunCellGate } from "../../../utils/tools/permissions"

const mocks = vi.hoisted(() => ({
  runCell: vi.fn(),
  cancelCell: vi.fn(),
  persist: vi.fn().mockResolvedValue(undefined),
  updateBuffer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../providers/EditorProvider", () => ({
  useEditor: () => ({
    updateBuffer: mocks.updateBuffer,
    activeBuffer: { id: 999 },
  }),
}))
vi.mock("../../../hooks/useQueryExecution", () => ({
  useQueryExecution: () => ({ executeSingle: vi.fn() }),
}))
// Only the SQL boundary is controlled: provider, coordinator, gesture hook and
// telemetry outcome classification all execute their production code.
vi.mock("./useCellExecution", () => ({
  useCellExecution: () => ({
    runCell: mocks.runCell,
    runningCellIds: new Set(),
    cancelCell: mocks.cancelCell,
    abortCellRun: mocks.cancelCell,
    cancelQuery: vi.fn(),
    setActiveStatement: vi.fn(),
    validateForDraw: vi.fn(),
    reRunResultAt: vi.fn(),
  }),
}))
vi.mock("./useNotebookPersistence", () => ({
  useNotebookPersistence: () => ({
    persistCells: mocks.persist,
    persistImmediately: mocks.persist,
    persistDebounced: mocks.persist,
  }),
}))
vi.mock("../../../store/notebookResults", () => ({
  pinNotebookSnapshots: () => () => {},
  pruneToRecentNotebooks: () => Promise.resolve(undefined),
  loadSnapshotCellIds: () => Promise.resolve([]),
  loadCellSnapshot: () => Promise.resolve(undefined),
  deleteCellSnapshot: () => Promise.resolve(undefined),
  copyNotebookSnapshots: () => Promise.resolve(undefined),
}))

const success = (statements = 1): CellRunOutcome => ({
  ok: true,
  superseded: false,
  result: {
    results: Array.from({ length: statements }, (_, i) => ({
      type: "dml" as const,
      query: `insert into private_values values (${i})`,
    })),
    timestamp: 1,
    activeResultIndex: 0,
  },
})
const completionEvents = () =>
  vi
    .mocked(trackEvent)
    .mock.calls.filter(
      ([event]) => event === ConsoleEvent.NOTEBOOK_CELL_EXECUTION,
    )
const mount = (sql = "select 1", result?: CellResult) => {
  let actions!: NotebookActions
  const coordinator = new QueryExecutionManager()
  const Harness = () => {
    actions = useNotebookActions()
    const { cells } = useNotebookState()
    const gestures = useCellRunActions({
      cell: cells[0],
      isRunning: false,
      editorRef: useRef(null),
      applyHighlight: vi.fn(),
      clearHighlight: vi.fn(),
    })
    return <Button onClick={gestures.runAll}>Run all</Button>
  }
  renderComponent(
    <QuestContext.Provider
      value={{
        quest: questClient,
        questExecution: coordinator,
        buildVersion: { type: "oss", version: "test" },
        commitHash: "test",
      }}
    >
      <NotebookProvider
        bufferId={42}
        initialState={{
          cells: [{ id: "c1", position: 0, value: sql, result }],
        }}
      >
        <Harness />
      </NotebookProvider>
    </QuestContext.Provider>,
  )
  return { actions: () => actions, coordinator }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.runCell.mockReset().mockResolvedValue(success())
  mocks.persist.mockResolvedValue(undefined)
  mocks.updateBuffer.mockResolvedValue(undefined)
})

describe("NotebookProvider execution telemetry", () => {
  it.each([1, 2])(
    "reports one intent and one completion for a %i-statement Run all",
    async (count) => {
      mocks.runCell.mockResolvedValue(success(count))
      mount(Array.from({ length: count }, (_, i) => `select ${i}`).join(";"))
      await userEvent.click(screen.getByRole("button", { name: "Run all" }))
      await waitFor(() => expect(completionEvents()).toHaveLength(1))
      expect(
        vi
          .mocked(trackEvent)
          .mock.calls.filter(
            ([event]) => event === ConsoleEvent.NOTEBOOK_CELL_RUN,
          ),
      ).toEqual([
        [
          ConsoleEvent.NOTEBOOK_CELL_RUN,
          {
            notebookId: 42,
            cellId: "c1",
            phase: "requested",
            trigger: "manual",
          },
        ],
      ])
      expect(completionEvents()).toEqual([
        [
          ConsoleEvent.NOTEBOOK_CELL_EXECUTION,
          {
            notebookId: 42,
            cellId: "c1",
            mode: "grid",
            trigger: "run",
            outcome: "success",
            durationMs: expect.any(Number) as number,
          },
        ],
      ])
      expect(mocks.runCell).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(completionEvents())).not.toContain("private_values")
    },
  )

  it("reports SQL failure instead of a previous successful result", async () => {
    const { actions } = mount("select 1", success().result)
    await act(async () => {
      await actions().runCell("c1")
    })
    mocks.runCell.mockResolvedValue({
      ok: false,
      superseded: false,
      result: {
        results: [
          { type: "error", query: "select secret", error: "private error" },
        ],
        timestamp: 2,
        activeResultIndex: 0,
      },
    })
    await act(async () => {
      await actions().runCell("c1")
    })
    expect(completionEvents().map(([, payload]) => payload?.outcome)).toEqual([
      "success",
      "error",
    ])
    expect(JSON.stringify(completionEvents())).not.toMatch(/private|secret/)
  })

  it("rejects thrown execution errors, emits one failure, and releases the coordinator", async () => {
    const error = new Error("private SQL error")
    mocks.runCell.mockRejectedValue(error)
    const { actions, coordinator } = mount()
    await act(async () => {
      await expect(actions().runCell("c1")).rejects.toBe(error)
    })
    expect(completionEvents()).toHaveLength(1)
    expect(completionEvents()[0][1]).toMatchObject({
      notebookId: 42,
      cellId: "c1",
      outcome: "error",
    })
    expect(coordinator.getSnapshot().active).toBeNull()
  })

  it("records a dismissed queued run as cancelled without executing it", async () => {
    let finish!: (result: CellRunOutcome) => void
    mocks.runCell.mockReturnValue(
      new Promise<CellRunOutcome>((resolve) => {
        finish = resolve
      }),
    )
    const { actions, coordinator } = mount()
    let active!: Promise<CellRunOutcome>
    let pending!: Promise<CellRunOutcome>
    act(() => {
      active = actions().runCell("c1")
      pending = actions().runCell("c1")
    })
    expect(coordinator.getSnapshot().dialogOpen).toBe(true)
    expect(mocks.runCell).toHaveBeenCalledTimes(1)
    await act(async () => {
      coordinator.dismissPending()
      await pending
    })
    expect(completionEvents()).toHaveLength(1)
    expect(completionEvents()[0][1]).toMatchObject({
      outcome: "cancelled",
      notebookId: 42,
      cellId: "c1",
    })
    await act(async () => {
      finish(success())
      await active
    })
    expect(completionEvents().map(([, payload]) => payload?.outcome)).toEqual([
      "cancelled",
      "success",
    ])
  })

  it.each([
    [{ kind: "autoRun" } as RunCellGate, "auto_run"],
    [
      {
        kind: "explicit",
        permissions: { read: true, write: false, grantSchemaAccess: true },
      } as RunCellGate,
      null,
    ],
  ])(
    "distinguishes automatic and explicit MCP runs (%j)",
    async (gate, trigger) => {
      const { actions } = mount()
      await act(async () => {
        await actions().runCell("c1", undefined, undefined, false, gate)
      })
      expect(mocks.runCell).toHaveBeenCalledTimes(1)
      expect(completionEvents()).toHaveLength(trigger ? 1 : 0)
      if (trigger)
        expect(completionEvents()[0][1]).toMatchObject({
          notebookId: 42,
          trigger,
          outcome: "success",
        })
    },
  )

  it("drops a completion from a session that ended while SQL was in flight", async () => {
    let finish!: (result: CellRunOutcome) => void
    mocks.runCell.mockReturnValue(
      new Promise<CellRunOutcome>((resolve) => {
        finish = resolve
      }),
    )
    const { actions } = mount()
    let pending!: Promise<CellRunOutcome>
    act(() => {
      pending = actions().runCell("c1")
    })
    authSessionState.endSession()
    authSessionState.markNonSSOAuthenticated()
    await act(async () => {
      finish(success())
      await pending
    })
    expect(completionEvents()).toHaveLength(0)
  })
})
