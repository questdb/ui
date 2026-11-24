// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { rootReducer } from "../../../src/store"
import { Button } from "../../../src/components/Button"
import { renderComponent } from "../../../src/test/component"
import { db } from "../../../src/store/db"
import type { NotebookViewState } from "../../../src/store/notebook"
import { Type } from "../../../src/utils/questdb/types"
import { QuestContext } from "../../../src/providers/QuestProvider"
import {
  AIStatusProvider,
  useAIStatus,
} from "../../../src/providers/AIStatusProvider"
import { AIConversationProvider } from "../../../src/providers/AIConversationProvider"
import { ChatInput } from "../../../src/scenes/Editor/AIChatWindow/ChatInput"
import {
  NotebookProvider,
  useNotebookState,
} from "../../../src/scenes/Editor/Notebook/NotebookProvider"
import { CellBottomContent } from "../../../src/scenes/Editor/Notebook/cells/CellBottomContent"
import { useCellRefresh } from "../../../src/scenes/Editor/Notebook/cellRefresh/CellRefreshContext"
import { CellRefreshEngine } from "../../../src/scenes/Editor/Notebook/cellRefresh/cellRefreshEngine"
import { useCellVirtualizationEngine } from "../../../src/scenes/Editor/Notebook/cellVirtualization/CellVirtualizationContext"
import { persistCellSnapshot } from "../../../src/scenes/Editor/Notebook/persistCellSnapshot"
import { expandGlobals } from "../../../src/scenes/Editor/Notebook/declareUtils"
import { QueryExecutionManager } from "../../../src/utils/questdb/queryExecutionManager"
import { dispatchTool } from "../../../src/utils/tools/dispatch"
import { createNotebookFreshness } from "../../../src/utils/notebooks/notebookFreshness"

vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({
    updateBuffer: () => Promise.resolve(),
    activeBuffer: { id: 908 },
    buffers: [],
  }),
}))
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

const noop = () => undefined
const bufferId = 908
const gridId = "station-grid"
const sourceId = "station-picker"
const initialVars = [{ name: "station", value: "'east'" }]
const sourceSql =
  "select 'east' as station, 4 as reading union all select 'west', 9"
const dependentSql = "select @station as station"
const cols = [{ name: "station", type: "STRING" }]
const sourceCols = [...cols, { name: "reading", type: "INT" }]
const initial: NotebookViewState = {
  settings: { variables: initialVars, autoRefreshDefault: false },
  cells: [
    {
      id: sourceId,
      position: 0,
      value: sourceSql,
      mode: "draw",
      autoRefresh: false,
      chartConfig: { xColumn: null, queries: [null], visual: { type: "stat" } },
      interactions: { click: { variable: "station" } },
    },
    {
      id: gridId,
      position: 1,
      value: dependentSql,
      autoRefresh: false,
      lastRunStatus: "success",
    },
  ],
}

const Dashboard = () => {
  const { cells, settings, runningCellIds } = useNotebookState()
  const refresh = useCellRefresh()!
  const virtualization = useCellVirtualizationEngine()!
  const reveal = () => {
    for (const id of [sourceId, gridId]) {
      refresh.setVisible(id, true)
      virtualization.reportMountBand(id, true, 0)
      virtualization.reportRetainBand(id, true)
    }
  }
  return (
    <>
      <Button onClick={reveal}>Reveal cells</Button>
      <output data-testid="binding">{settings.variables?.[0]?.value}</output>
      {cells.map((cell) => (
        <CellBottomContent
          key={cell.id}
          cell={cell}
          contentMode="full"
          expectingResult
          isFocused
          isRunning={runningCellIds.has(cell.id)}
          refreshIntervalMs={undefined}
          onSettingsChange={noop}
          onRetryUnmountWhileFocused={noop}
          onYieldFocus={noop}
        />
      ))}
    </>
  )
}

it("Chat Stop during mounted run validation cancels the run and its queued selection refresh", async () => {
  // Supply grid viewport dimensions; no layout behavior is asserted.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  )
  await db.open()
  await db.buffers.put({
    id: bufferId,
    label: "Station dashboard",
    value: "",
    position: 0,
    notebookViewState: initial,
  })
  expect(
    await persistCellSnapshot({
      bufferId,
      cellId: gridId,
      savedAt: Date.now(),
      results: [
        {
          type: "dql",
          query: dependentSql,
          effectiveQuery: expandGlobals(dependentSql, initialVars),
          columns: cols,
          dataset: [["east"]],
          count: 1,
        },
      ],
    }),
  ).toBe(true)
  const variablesChanged = vi.spyOn(
    CellRefreshEngine.prototype,
    "variablesChanged",
  )
  const targetQuery = expandGlobals(dependentSql, [
    { name: "station", value: "'west'" },
  ])
  const initialQuery = expandGlobals(dependentSql, initialVars)
  let validationSignal: AbortSignal | undefined
  const validateQuery = vi.fn((query: string, signal?: AbortSignal) => {
    const result = {
      query,
      columns: query.includes("as reading") ? sourceCols : cols,
      timestamp: -1,
    }
    if (query === initialQuery) {
      validationSignal = signal
      return new Promise<typeof result>((_, reject) => {
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        })
      })
    }
    return Promise.resolve(result)
  })
  let n = 0
  const queryRaw = vi.fn(
    (query: string, _options: { background?: boolean }) => {
      const source = query.includes("as reading")
      return {
        queryId: `q-${++n}`,
        promise: Promise.resolve({
          type: Type.DQL,
          columns: source ? sourceCols : cols,
          dataset: source
            ? [
                ["east", 4],
                ["west", 9],
              ]
            : [[query === targetQuery ? "west" : "east"]],
          count: source ? 2 : 1,
        }),
      }
    },
  )
  const dependentCalls = () =>
    queryRaw.mock.calls.filter(([q]) => q.includes(dependentSql))
  const questExecution = new QueryExecutionManager()
  const quest = { queryRaw, validateQuery, abort: vi.fn() }
  const questContext = {
    quest,
    questExecution,
  } as unknown as React.ContextType<typeof QuestContext>
  const permissions = { read: false, write: false, grantSchemaAccess: false }
  const toolContext = { notebookFreshness: createNotebookFreshness() }
  // The chat model boundary: deliver the same real tool calls, status setter,
  // freshness tracker and per-turn signal as the chat tool dispatcher.
  const client = {} as Parameters<typeof dispatchTool>[2]
  const notUsed = () => {
    throw new Error("Unexpected model-side SQL validation")
  }
  let run!: ReturnType<typeof dispatchTool>
  let inspect!: ReturnType<typeof dispatchTool>
  let chatSignal: AbortSignal | undefined
  const Chat = () => {
    const { setStatus, abortController } = useAIStatus()
    const tool = (name: string, args: object) =>
      dispatchTool(
        name,
        args,
        client,
        setStatus,
        permissions,
        notUsed,
        abortController?.signal,
        toolContext,
      )
    return (
      <>
        <Button
          onClick={() => {
            inspect = tool("get_notebook_state", { buffer_id: bufferId })
          }}
        >
          Read notebook
        </Button>
        <Button
          onClick={() => {
            chatSignal = abortController?.signal
            run = tool("run_cell", { buffer_id: bufferId, cell_id: gridId })
          }}
        >
          Assistant runs grid
        </Button>
        <ChatInput onSend={noop} onContextClick={noop} />
      </>
    )
  }
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <AIConversationProvider>
        <AIStatusProvider>
          <QuestContext.Provider value={questContext}>
            <NotebookProvider bufferId={bufferId} initialState={initial}>
              <Dashboard />
              <Chat />
            </NotebookProvider>
          </QuestContext.Provider>
        </AIStatusProvider>
      </AIConversationProvider>
    </Provider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Reveal cells" }))
  const west = await screen.findByRole(
    "button",
    { name: /west/i },
    { timeout: 5000 },
  )
  expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
  expect(dependentCalls()).toHaveLength(0)
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Read notebook" }))
    const read = await inspect
    expect(read.is_error, read.content).toBeFalsy()
  })
  fireEvent.click(screen.getByRole("button", { name: "Assistant runs grid" }))
  await waitFor(() => expect(validationSignal?.aborted).toBe(false))
  const stop = screen.getByRole("button", { name: "Stop AI generation" })
  expect(stop).toBeVisible()
  expect(chatSignal?.aborted).toBe(false)
  expect(dependentCalls()).toHaveLength(0)

  fireEvent.click(west)
  expect(west).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByTestId("binding")).toHaveTextContent("'west'")
  expect(variablesChanged).toHaveBeenCalledWith(false)
  expect(validationSignal?.aborted).toBe(false)
  expect(dependentCalls()).toHaveLength(0)
  expect(screen.getByRole("gridcell")).toHaveTextContent(/^east$/)

  let result!: Awaited<typeof run>
  await act(async () => {
    fireEvent.click(stop)
    result = await run
  })
  expect(chatSignal?.aborted).toBe(true)
  expect(validationSignal?.aborted).toBe(true)
  expect(
    screen.queryByRole("button", { name: "Stop AI generation" }),
  ).not.toBeInTheDocument()
  expect(JSON.parse(result.content)).toMatchObject({
    cancelled: "cancelled",
    queryCount: 0,
  })
  const observation = {
    binding: screen.getByTestId("binding").textContent,
    grid: screen.getByRole("gridcell").textContent,
    dependentQueries: dependentCalls().map(([query, opts]) => ({
      query,
      background: opts.background,
    })),
  }
  expect(observation).toEqual({
    binding: "'west'",
    grid: "east",
    dependentQueries: [],
  })
})
