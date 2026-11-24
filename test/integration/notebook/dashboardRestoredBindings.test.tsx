// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import { Button } from "../../../src/components/Button"
import { db } from "../../../src/store/db"
import type { NotebookViewState } from "../../../src/store/notebook"
import { Type } from "../../../src/utils/questdb/types"
import { QuestContext } from "../../../src/providers/QuestProvider"
import {
  NotebookProvider,
  useNotebookState,
} from "../../../src/scenes/Editor/Notebook/NotebookProvider"
import { VariablesPopover } from "../../../src/scenes/Editor/Notebook/globals/VariablesPopover"
import { CellBottomContent } from "../../../src/scenes/Editor/Notebook/cells/CellBottomContent"
import { useCellRefresh } from "../../../src/scenes/Editor/Notebook/cellRefresh/CellRefreshContext"
import { useCellVirtualizationEngine } from "../../../src/scenes/Editor/Notebook/cellVirtualization/CellVirtualizationContext"
import { persistCellSnapshot } from "../../../src/scenes/Editor/Notebook/persistCellSnapshot"
import { expandGlobals } from "../../../src/scenes/Editor/Notebook/declareUtils"

const updateBuffer = vi.fn(
  (_id: number, _patch: { notebookViewState: NotebookViewState }) =>
    Promise.resolve(),
)
vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer }),
}))
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
// No chart/editor/browser layout needed to observe the actual Run grid.
vi.mock("../../../src/scenes/Editor/Notebook/DrawCanvas", () => ({
  DrawCanvas: () => null,
}))

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

const sql = "select @station as station"
const columns = [{ name: "station", type: "STRING" }]
const cellId = "restore-run"
const noop = () => undefined

const RunGrid = () => {
  const { cells } = useNotebookState()
  const refresh = useCellRefresh()!
  const virtualization = useCellVirtualizationEngine()!
  return (
    <>
      <Button
        onClick={() => {
          // NotebookContent's near/far observer callbacks, with geometry omitted.
          refresh.setVisible(cellId, true)
          virtualization.reportMountBand(cellId, true, 0)
          virtualization.reportRetainBand(cellId, true)
        }}
      >
        Reveal Run
      </Button>
      <CellBottomContent
        cell={cells[0]}
        contentMode="full"
        expectingResult
        isFocused={false}
        isRunning={false}
        refreshIntervalMs={undefined}
        onSettingsChange={noop}
        onRetryUnmountWhileFocused={noop}
        onYieldFocus={noop}
      />
    </>
  )
}

it.each([true, false])(
  "on reopen: changed variable is referenced = %s",
  async (referenced) => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 600),
    )
    updateBuffer.mockClear()
    await db.open()
    const bufferId = referenced ? 94 : 95
    const variables = [
      { name: "station", value: "'east'" },
      { name: "unused", value: "'north'" },
    ]
    const initial: NotebookViewState = {
      cells: [
        {
          id: cellId,
          position: 0,
          value: sql,
          autoRefresh: false,
          lastRunStatus: "success",
        },
      ],
      settings: { variables },
    }
    expect(
      await persistCellSnapshot({
        bufferId,
        cellId,
        savedAt: Date.now(),
        results: [
          {
            type: "dql",
            query: sql,
            effectiveQuery: expandGlobals(sql, variables),
            columns,
            dataset: [["east"]],
            count: 1,
          },
        ],
      }),
    ).toBe(true)

    let finish!: () => void
    const held = new Promise<void>((resolve) => {
      finish = resolve
    })
    const queryRaw = vi.fn((query: string, _options: unknown) => ({
      queryId: "probe",
      promise: held.then(() => ({
        type: Type.DQL,
        columns,
        dataset: [[query.includes("@station := 'west'") ? "west" : "east"]],
        count: 1,
      })),
    }))
    const validateQuery = vi.fn((query: string) =>
      Promise.resolve({
        query,
        columns,
        timestamp: 0,
      }),
    )
    const context = {
      quest: { queryRaw, validateQuery, abort: noop },
    } as unknown as React.ContextType<typeof QuestContext>
    const mount = (state: NotebookViewState, grid = false) =>
      renderComponent(
        <QuestContext.Provider value={context}>
          <NotebookProvider bufferId={bufferId} initialState={state}>
            {grid ? <RunGrid /> : <VariablesPopover />}
          </NotebookProvider>
        </QuestContext.Provider>,
      )
    const editing = mount(initial)
    fireEvent.click(screen.getByRole("button", { name: "Variables (2)" }))
    const input = (await screen.findAllByPlaceholderText(/^value/))[
      referenced ? 0 : 1
    ]
    fireEvent.change(input, { target: { value: "'west'" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(updateBuffer).toHaveBeenCalledTimes(1))
    const saved = updateBuffer.mock.calls[0][1].notebookViewState
    expect(saved.settings?.variables?.[referenced ? 0 : 1].value).toBe("'west'")
    expect(saved.cells[0].value).toBe(sql)
    expect(saved.cells[0].result).toBeUndefined()
    expect(queryRaw).not.toHaveBeenCalled()
    editing.unmount()
    validateQuery.mockClear()

    mount(saved, true)
    fireEvent.click(screen.getByRole("button", { name: "Reveal Run" }))
    expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
    // Restore is observable before allowing the DB boundary stub to settle.
    finish()
    const rows = () => screen.getAllByRole("gridcell").map((e) => e.textContent)
    const observe = () => ({
      rows: rows(),
      refreshes: queryRaw.mock.calls.length,
    })
    if (referenced) {
      await waitFor(() =>
        expect(observe()).toEqual({ rows: ["west"], refreshes: 1 }),
      )
      expect(queryRaw).toHaveBeenCalledWith(
        expandGlobals(sql, saved.settings!.variables),
        expect.objectContaining({ background: true }),
      )
    } else {
      expect(observe()).toEqual({ rows: ["east"], refreshes: 0 })
    }
  },
)
