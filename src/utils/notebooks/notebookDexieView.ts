import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { db } from "../../store/db"
import { bufferStore } from "../../store/buffers"
import {
  dropLegacyChartConfigs,
  exceedsCellLineLimit,
  MAX_CELL_LINES,
  migrateLegacyCellNames,
} from "../../store/notebook"
import type {
  NotebookCell,
  NotebookSettings,
  NotebookViewState,
} from "../../store/notebook"
import { NotebookToolError } from "./notebookToolError"
import { buildPersistPayload } from "../../scenes/Editor/Notebook/notebookUtils"

// Persisted-view IO for notebook buffers: migrated reads, full-view commits,
// and the cell guards shared by the Dexie controller and the headless run
// engine.

type NotebookBufferMeta =
  | { kind: "ok"; label: string; view: NotebookViewState }
  | { kind: "archived"; label: string }
  | { kind: "deleted" }
  | { kind: "not_a_notebook" }

export const migratePersistedNotebookView = (view: NotebookViewState) =>
  dropLegacyChartConfigs(migrateLegacyCellNames(view))

export const readNotebookBufferMeta = async (
  bufferId: number,
): Promise<NotebookBufferMeta> => {
  const buffer = await bufferStore.getById(bufferId)
  if (!buffer) return { kind: "deleted" }
  if (buffer.archived) return { kind: "archived", label: buffer.label }
  if (!buffer.notebookViewState) return { kind: "not_a_notebook" }
  return {
    kind: "ok",
    label: buffer.label,
    view: migratePersistedNotebookView(buffer.notebookViewState),
  }
}

export const readNotebookView = async (
  bufferId: number,
): Promise<NotebookViewState> => {
  const meta = await readNotebookBufferMeta(bufferId)
  switch (meta.kind) {
    case "deleted":
      throw new NotebookToolError(
        "deleted",
        `Notebook ${bufferId} no longer exists.`,
      )
    case "archived":
      throw new NotebookToolError(
        "archived",
        `Notebook "${meta.label}" is archived.`,
      )
    case "not_a_notebook":
      throw new NotebookToolError(
        "not_a_notebook",
        `Buffer ${bufferId} exists but is not a notebook.`,
      )
    default:
      return meta.view
  }
}

const SEARCH_PUBLISH_DEBOUNCE_MS = 300

const searchPublishTimers = new Map<number, ReturnType<typeof setTimeout>>()

const schedulePublishSearchUpdate = (bufferId: number): void => {
  const existing = searchPublishTimers.get(bufferId)
  if (existing !== undefined) clearTimeout(existing)
  searchPublishTimers.set(
    bufferId,
    setTimeout(() => {
      searchPublishTimers.delete(bufferId)
      eventBus.publish(EventType.BUFFERS_UPDATED, {
        type: "update",
        metaUpdate: false,
        contentUpdate: true,
        bufferId,
      })
    }, SEARCH_PUBLISH_DEBOUNCE_MS),
  )
}

export const cancelPendingSearchPublish = (bufferId: number): void => {
  const timer = searchPublishTimers.get(bufferId)
  if (timer !== undefined) {
    clearTimeout(timer)
    searchPublishTimers.delete(bufferId)
  }
}

export type ViewParts = {
  cells: NotebookCell[]
  settings: NotebookSettings
  maximizedCellId: string | null
  focusedCellId: string | null
}

export const partsOf = (view: NotebookViewState): ViewParts => ({
  cells: view.cells,
  settings: view.settings ?? {},
  maximizedCellId: view.maximizedCellId ?? null,
  focusedCellId: view.focusedCellId ?? null,
})

export type CommitOutcome = "committed" | "archived" | "deleted"

// Re-reads the row inside the write transaction and rejects an archived or
// deleted buffer atomically with the update. Archive and delete both bypass the
// buffer queue (direct Dexie writes), so a task that read a live view can reach
// here after the user archived/deleted the notebook; a bare update() would
// silently overwrite the archived row (or report 0 rows on a deleted one) and
// pretend it committed, surfacing the hidden edit when the notebook is restored.
export const commitView = async (
  bufferId: number,
  parts: ViewParts,
): Promise<CommitOutcome> => {
  const outcome = await db.transaction(
    "rw",
    db.buffers,
    async (): Promise<CommitOutcome> => {
      const buffer = await bufferStore.getById(bufferId)
      if (!buffer) return "deleted"
      if (buffer.archived) return "archived"
      const updated = await bufferStore.update(bufferId, {
        notebookViewState: buildPersistPayload(
          parts.cells,
          parts.focusedCellId,
          parts.maximizedCellId,
          parts.settings,
        ),
      })
      return updated === 0 ? "deleted" : "committed"
    },
  )
  if (outcome === "committed") schedulePublishSearchUpdate(bufferId)
  return outcome
}

export const requireCellIn = (
  cells: NotebookCell[],
  cellId: string,
  bufferId: number,
): NotebookCell => {
  const cell = cells.find((c) => c.id === cellId)
  if (!cell) {
    throw new NotebookToolError(
      "unknown_cell",
      `Cell ${cellId} not found in notebook ${bufferId}.`,
    )
  }
  return cell
}

export const requireCellWithinLineLimit = (value: string): void => {
  if (exceedsCellLineLimit(value)) {
    throw new NotebookToolError(
      "cell_too_large",
      `Cell content has ${value.split("\n").length} lines, over the ${MAX_CELL_LINES}-line limit. Split it into multiple cells.`,
    )
  }
}

export const __resetNotebookDexieViewForTests = (): void => {
  for (const timer of searchPublishTimers.values()) {
    clearTimeout(timer)
  }
  searchPublishTimers.clear()
}
