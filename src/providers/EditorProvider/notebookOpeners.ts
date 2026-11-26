import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { Buffer } from "../../store/buffers"
import { bufferStore } from "../../store/buffers"
import { createCell, type NotebookCell } from "../../store/notebook"
import type { ExampleDashboard } from "../SettingsProvider/types"
import type { EditorContext } from "./index"
import { toast } from "../../components/Toast"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { requestCellReveal } from "../../scenes/Editor/Notebook/cellReveal"
import {
  generateId,
  resolveAutoRefresh,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { fetchExampleDashboard } from "../../utils/examples/exampleDashboards"
import { exampleAutoRunCellIds } from "../../utils/examples/exampleAutoRun"
import { emitUserAction } from "../../utils/notebooks/notebookAIBridge"
import {
  addCellTransition,
  withBoundNotebook,
  withBoundNotebookReadOnly,
} from "../../utils/notebooks/notebookController"
import { NotebookToolError } from "../../utils/notebooks/notebookToolError"
import {
  buildTablePreviewCell,
  TABLE_PREVIEW_AUTO_REFRESH,
} from "../../utils/notebooks/tablePreviewCell"

const CELL_START_RANGE = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
}

// Runs `run` once per key at a time; a call for a key that is still in flight
// gets the pending promise instead of starting another run.
const singleFlight = (
  requests: Map<string, Promise<void>>,
  key: string,
  run: () => Promise<void>,
): Promise<void> => {
  const pending = requests.get(key)
  if (pending) return pending
  const request = run().finally(() => {
    requests.delete(key)
  })
  requests.set(key, request)
  return request
}

export const exampleErrorMessage = (title: string, error: unknown) =>
  error instanceof Error
    ? `Could not open the example dashboard "${title}": ${error.message}`
    : `Could not open the example dashboard "${title}"`

const cellsNotRunMessage = (count: number) =>
  count === 1
    ? "1 cell could not be run automatically. Run it from the notebook."
    : `${count} cells could not be run automatically. Run them from the notebook.`

const isCellGone = (error: unknown) =>
  error instanceof NotebookToolError && error.code === "unknown_cell"

const isNotebookGone = (error: unknown) =>
  error instanceof NotebookToolError &&
  (error.code === "archived" || error.code === "deleted")

// Parks an edit reveal for the cell; the notebook and its editor drain it
// once mounted, so the cursor lands in the cell even on a cold mount.
export const revealCellForEditing = (bufferId: number, cellId: string) => {
  requestCellReveal({
    bufferId,
    cellId,
    range: CELL_START_RANGE,
    notebookField: "cell",
    cellType: "sql",
    mode: "edit",
  })
  eventBus.publish(EventType.NOTEBOOK_REVEAL_CELL)
}

// Runs cells through the auto-run gate, one at a time, so a write statement
// never runs unattended. A cell that fails or is refused does not stop the
// others, and the user is told how many did not run. A cell deleted meanwhile
// is skipped; a notebook closed meanwhile stops the run.
export const runCellsAutomatically = async (
  bufferId: number,
  cellIds: string[],
) => {
  let notRun = 0
  for (const cellId of cellIds) {
    try {
      const summary = await withBoundNotebook(bufferId, (controller) =>
        controller.runCell(cellId, undefined, undefined, {
          kind: "autoRun",
          initiator: "user",
        }),
      )
      if (summary.denied !== undefined) notRun += 1
    } catch (error) {
      if (isNotebookGone(error)) break
      if (isCellGone(error)) continue
      console.error("Could not run a cell automatically:", error)
      notRun += 1
    }
  }
  if (notRun > 0) toast.error(cellsNotRunMessage(notRun))
}

// Example and table notebooks start without results; charts bootstrap
// themselves on mount, grid cells are run here so the notebook fills in
// without a click per cell.
export const runNotebookAutomatically = async (bufferId: number) => {
  try {
    const { cells } = await withBoundNotebook(bufferId, (controller) =>
      controller.readView(),
    )
    await runCellsAutomatically(bufferId, exampleAutoRunCellIds(cells))
  } catch (error) {
    console.error("Could not run the notebook:", error)
  }
}

// Adds a cell, or calls `onCellLimit` when the notebook is full. Any other
// failure is reported to the user. Resolves the added cell's id.
const addCellOrFallBack = async (
  add: () => Promise<string>,
  onCellLimit: () => Promise<void>,
): Promise<string | undefined> => {
  try {
    return await add()
  } catch (error) {
    if (error instanceof NotebookToolError && error.code === "cell_limit") {
      await onCellLimit()
      return undefined
    }
    console.error(error)
    toast.error(
      error instanceof Error
        ? `Failed to add cell: ${error.message}`
        : "Failed to add cell",
    )
    return undefined
  }
}

type NotebookOpenerDependencies = {
  buffers: Buffer[]
  temporaryBufferId: number | null
  tabsDisabled: boolean
  activeBufferRef: MutableRefObject<Buffer>
  addBuffer: EditorContext["addBuffer"]
  setActiveBuffer: EditorContext["setActiveBuffer"]
  exampleRequests: Map<string, Promise<void>>
  tableNotebookRequests: Map<string, Promise<void>>
  setOpeningExampleIds: Dispatch<SetStateAction<string[]>>
}

// Opens notebooks on the user's behalf: example dashboards, the Schema
// "Query" notebook, and a query sent to a notebook tab.
export const createNotebookOpeners = ({
  buffers,
  temporaryBufferId,
  tabsDisabled,
  activeBufferRef,
  addBuffer,
  setActiveBuffer,
  exampleRequests,
  tableNotebookRequests,
  setOpeningExampleIds,
}: NotebookOpenerDependencies) => {
  const openNotebookWithCell = async (value: string) => {
    const cell = createCell(0, value)
    const notebook = await addBuffer({
      notebookViewState: { cells: [cell] },
    })
    if (notebook?.id === undefined) return
    revealCellForEditing(notebook.id, cell.id)
  }

  // Mirrors the notebook's "Add cell" button: the new cell lands at the end,
  // full width in grid mode, then takes focus with the cursor in its editor.
  // A notebook at its cell limit gets a fresh notebook whose first cell holds
  // the query.
  const appendNotebookCell = async (bufferId: number, value: string) => {
    const cellId = await addCellOrFallBack(
      () =>
        withBoundNotebook(bufferId, (controller) =>
          controller.mutate((parts) =>
            addCellTransition(parts, bufferId, { id: generateId(), value }),
          ),
        ),
      () => openNotebookWithCell(value),
    )
    if (cellId === undefined) return
    emitUserAction({ kind: "user_added_cell", bufferId, cellId })
    revealCellForEditing(bufferId, cellId)
  }

  const openExampleDashboardNow = async (example: ExampleDashboard) => {
    const open = buffers.find(
      (b) => b.templateId === example.id && !b.archived && !b.isTemporary,
    )
    void trackEvent(ConsoleEvent.TAB_PANEL_EXAMPLE_OPEN, {
      id: example.id,
      source: "manual",
      reused: !!open,
    })
    if (open) {
      await setActiveBuffer(open)
      return
    }
    const activeAtRequest = activeBufferRef.current.id
    try {
      const { notebookViewState } = await fetchExampleDashboard(example.path)
      // A user who moved to another tab while the file loaded stays there;
      // the example opens in the background.
      const created = await addBuffer(
        { label: example.title, notebookViewState, templateId: example.id },
        { activate: activeBufferRef.current.id === activeAtRequest },
      )
      if (created?.id !== undefined) {
        void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_LOAD, {
          templateId: example.id,
          source: "manual",
          outcome: "success",
        })
        void runNotebookAutomatically(created.id)
      }
    } catch (error) {
      console.error(error)
      void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_LOAD, {
        templateId: example.id,
        source: "manual",
        outcome: "error",
      })
      toast.error(exampleErrorMessage(example.title, error))
    }
  }

  // A second activation while the file is still being fetched joins the first
  // one instead of creating another copy; the row shows a spinner meanwhile.
  const openExampleDashboard: EditorContext["openExampleDashboard"] = (
    example,
  ) =>
    singleFlight(exampleRequests, example.id, async () => {
      setOpeningExampleIds((ids) => [...ids, example.id])
      try {
        await openExampleDashboardNow(example)
      } finally {
        setOpeningExampleIds((ids) => ids.filter((id) => id !== example.id))
      }
    })

  const openTableNotebookNow = async ({
    name,
    designatedTimestamp,
  }: {
    name: string
    designatedTimestamp?: string
  }) => {
    const cell = buildTablePreviewCell(name, designatedTimestamp)
    const createTableNotebook = async () => {
      const created = await addBuffer({
        label: name,
        notebookViewState: {
          cells: [cell],
          settings: { autoRefreshDefault: TABLE_PREVIEW_AUTO_REFRESH },
        },
      })
      if (created?.id !== undefined) {
        void runNotebookAutomatically(created.id)
      }
    }
    // Fresh read: the schema rows are virtualized and may call in with a
    // render snapshot that predates the tab created by the previous click.
    const candidates = (await bufferStore.getAll()).filter(
      (b) =>
        b.label === name &&
        b.notebookViewState != null &&
        !b.archived &&
        b.id !== temporaryBufferId &&
        b.id !== undefined,
    )
    if (candidates.length === 0) {
      await createTableNotebook()
      return
    }
    const sql = cell.value.trim()
    const isQueryCell = (c: NotebookCell) =>
      c.type !== "markdown" && c.value.trim() === sql
    const views = await Promise.all(
      candidates.map((b) =>
        withBoundNotebookReadOnly(b.id as number, (view) =>
          Promise.resolve(view),
        ),
      ),
    )
    const withCellIndex = views.findIndex((view) =>
      view.cells.some(isQueryCell),
    )
    if (withCellIndex !== -1) {
      const target = candidates[withCellIndex]
      const existing = views[withCellIndex].cells.find(isQueryCell)
      await setActiveBuffer(target)
      if (existing) revealCellForEditing(target.id as number, existing.id)
      return
    }

    const target = candidates[0]
    const bufferId = target.id as number
    // The table query refreshes on Auto. It needs a cell override only when
    // the notebook has a different default.
    const inheritsRefresh =
      resolveAutoRefresh(undefined, views[0].settings?.autoRefreshDefault) ===
      TABLE_PREVIEW_AUTO_REFRESH
    const presentation: Partial<NotebookCell> = {
      name: cell.name,
      ...(inheritsRefresh ? {} : { autoRefresh: TABLE_PREVIEW_AUTO_REFRESH }),
      paneView: cell.paneView,
    }
    const cellId = await addCellOrFallBack(
      () =>
        withBoundNotebook(bufferId, (controller) =>
          controller.mutate((parts) => {
            const added = addCellTransition(parts, bufferId, {
              id: cell.id,
              value: cell.value,
            })
            return {
              ...added,
              parts: {
                ...added.parts,
                cells: added.parts.cells.map((c) =>
                  c.id === cell.id ? { ...c, ...presentation } : c,
                ),
              },
            }
          }),
        ),
      createTableNotebook,
    )
    if (cellId === undefined) return
    emitUserAction({ kind: "user_added_cell", bufferId, cellId })
    await setActiveBuffer(target)
    revealCellForEditing(bufferId, cellId)
    try {
      await withBoundNotebook(bufferId, (controller) =>
        controller.runCell(cellId),
      )
    } catch (error) {
      console.error("Could not run the table query:", error)
    }
  }

  // Schema tree "Query": a notebook named after the table with a cell reading
  // its newest rows, refreshing on Auto. A notebook with that name is reused: the
  // cell holding this query is focused, or, without one, the cell is appended
  // and run. A user notebook that happens to share the name keeps its cells.
  const openTableNotebook: EditorContext["openTableNotebook"] = (table) => {
    if (tabsDisabled) return Promise.resolve()
    return singleFlight(tableNotebookRequests, table.name, () =>
      openTableNotebookNow(table),
    )
  }

  return {
    appendNotebookCell,
    openNotebookWithCell,
    openExampleDashboard,
    openTableNotebook,
  }
}
