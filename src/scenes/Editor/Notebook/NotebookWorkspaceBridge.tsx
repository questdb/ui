import React, { useContext, useEffect, useRef } from "react"
import { MAX_TABS, useEditor } from "../../../providers/EditorProvider"
import { QuestContext } from "../../../providers/QuestProvider"
import {
  registerNotebookAgentDeps,
  registerWorkspace,
  unregisterNotebookAgentDeps,
  unregisterWorkspace,
} from "../../../utils/notebooks/notebookAIBridge"
import { NotebookToolError } from "../../../utils/notebooks/notebookToolError"
import {
  getBufferMode,
  getController,
} from "../../../utils/notebooks/notebookController"
import { enqueueBufferTask } from "../../../utils/notebooks/notebookBufferQueue"
import {
  bufferStore,
  exceedsBufferNameLimit,
  MAX_BUFFER_NAME_LENGTH,
} from "../../../store/buffers"
import { emitAgentEdit } from "../../../utils/notebooks/agentActivity"
import {
  nextOpenPosition,
  pinnedBuffersWithout,
} from "../../../utils/buffers/tabOrder"
import { requestCellReveal } from "./cellReveal"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const FIRST_LINE_RANGE = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
}

export const NotebookWorkspaceBridge: React.FC = () => {
  const {
    buffers,
    activeBuffer,
    addBuffer,
    setActiveBuffer,
    archiveBuffer,
    deleteBuffer,
    updateBuffer,
    duplicateNotebook: duplicateNotebookBuffer,
  } = useEditor()
  const { quest } = useContext(QuestContext)

  const buffersRef = useRef(buffers)
  buffersRef.current = buffers
  const activeBufferRef = useRef(activeBuffer)
  activeBufferRef.current = activeBuffer
  // Ref so the deps registration stays stable ([] deps) while the quest client
  // is swapped on reconnect.
  const questRef = useRef(quest)
  useEffect(() => {
    questRef.current = quest
  }, [quest])

  useEffect(() => {
    registerNotebookAgentDeps({ getQuest: () => questRef.current })
    return () => unregisterNotebookAgentDeps()
  }, [])

  // The AI suggestion tab is not in <workspace>: tab tools cannot target it.
  const findTab = (bufferId: number) => {
    const target = buffersRef.current.find(
      (b) => b.id === bufferId && !b.isPreviewBuffer,
    )
    if (!target) {
      throw new NotebookToolError(
        "deleted",
        `Tab ${bufferId} is not in the workspace.`,
      )
    }
    return target
  }

  const remainingOpenTabs = (bufferId: number) =>
    pinnedBuffersWithout(buffersRef.current, bufferId)

  useEffect(() => {
    registerWorkspace({
      async createNotebook({ label, signal }) {
        // AI-created notebooks start with no cells; the agent populates via add_cell / apply_notebook_state.
        // The agent always creates in the background — a background notebook
        // mounts no controller and is populated headlessly.
        const buffer = await addBuffer(
          {
            label: label ?? "Notebook",
            notebookViewState: { cells: [] },
          },
          { activate: false, signal },
        )
        if (!buffer?.id) {
          throw new NotebookToolError(
            "tab_limit",
            `Could not create the notebook: the tab limit (${MAX_TABS}) is reached.`,
          )
        }
        emitAgentEdit({ bufferId: buffer.id })
        return { bufferId: buffer.id, label: buffer.label }
      },
      async duplicateNotebook({ bufferId, signal }) {
        const src = buffersRef.current.find((b) => b.id === bufferId)
        if (!src) {
          throw new NotebookToolError(
            "deleted",
            `Notebook ${bufferId} no longer exists.`,
          )
        }
        if (src.archived) {
          throw new NotebookToolError(
            "archived",
            `Notebook "${src.label}" is archived; ask the user to restore it before duplicating.`,
          )
        }
        if (!src.notebookViewState) {
          throw new NotebookToolError(
            "not_a_notebook",
            `Buffer ${bufferId} is not a notebook.`,
          )
        }
        const created = await duplicateNotebookBuffer(bufferId, {
          activate: false,
          signal,
        })
        if (!created?.id) {
          throw new NotebookToolError(
            "tab_limit",
            `Could not create the duplicate: the tab limit (${MAX_TABS}) is reached.`,
          )
        }
        // A background duplicate is fully cloned already, so it mounts no
        // controller — nothing to wait for.
        emitAgentEdit({ bufferId: created.id })
        return { bufferId: created.id, label: created.label }
      },
      async archiveTab(bufferId) {
        const target = findTab(bufferId)
        if (target.archived) return
        const remaining = remainingOpenTabs(bufferId)
        if (remaining.length === 0) {
          throw new NotebookToolError(
            "last_tab",
            "Cannot close the only open tab. Create another tab first, then close this one.",
          )
        }
        await archiveBuffer(bufferId, "agent")
      },
      async restoreTab(bufferId) {
        const target = findTab(bufferId)
        if (!target.archived) return
        await updateBuffer(bufferId, {
          archived: false,
          archivedAt: undefined,
          isTemporary: false,
          position: nextOpenPosition(buffersRef.current),
        })
      },
      async activateTab(bufferId) {
        const target = await bufferStore.getById(bufferId)
        if (!target || target.isPreviewBuffer) {
          throw new NotebookToolError(
            "deleted",
            `Tab ${bufferId} is not in the workspace.`,
          )
        }
        if (target.archived) {
          throw new NotebookToolError(
            "archived",
            `Tab ${bufferId} is closed. Call restore_tab first.`,
          )
        }
        if (activeBufferRef.current.id !== bufferId) {
          await setActiveBuffer(target)
        }
      },
      async renameTab(bufferId, label) {
        findTab(bufferId)
        const trimmed = label.trim()
        if (trimmed === "" || exceedsBufferNameLimit(trimmed)) {
          throw new NotebookToolError(
            "validation",
            `label must be 1–${MAX_BUFFER_NAME_LENGTH} characters after trimming.`,
          )
        }
        await updateBuffer(bufferId, { label: trimmed })
      },
      async deleteTab(bufferId) {
        const target = findTab(bufferId)
        const remaining = remainingOpenTabs(bufferId)
        if (!target.archived && remaining.length === 0) {
          throw new NotebookToolError(
            "last_tab",
            "Cannot delete the only open tab. Create another tab first, then delete this one.",
          )
        }
        await deleteBuffer(bufferId, true, "agent")
      },
      async activateNotebook(bufferId, cellToFocus) {
        // The buffer is claimed by the live side (it is, or is becoming, the
        // active tab): a Dexie write here would land beneath the mounted
        // provider and be clobbered by its next persist. Route the focus
        // through the reveal path the mounted notebook already drains.
        if (getBufferMode(bufferId) !== undefined) {
          const target = buffersRef.current.find(
            (b) => b.id === bufferId && !b.archived && !!b.notebookViewState,
          )
          if (!target) return false
          if (activeBufferRef.current.id !== bufferId) {
            await setActiveBuffer(target)
          }
          const cells =
            (await getController(bufferId)?.readView())?.cells ??
            target.notebookViewState?.cells
          const cell = cellToFocus
            ? cells?.find((c) => c.id === cellToFocus)
            : undefined
          if (cell) {
            requestCellReveal({
              bufferId,
              cellId: cell.id,
              range: FIRST_LINE_RANGE,
              notebookField: "cell",
              cellType: cell.type === "markdown" ? "markdown" : "sql",
              mode: "highlight",
            })
            eventBus.publish(EventType.NOTEBOOK_REVEAL_CELL)
          }
          return true
        }

        const target = await enqueueBufferTask(bufferId, async () => {
          const buffer = await bufferStore.getById(bufferId)
          if (!buffer || buffer.archived || !buffer.notebookViewState) {
            return null
          }
          if (
            cellToFocus &&
            buffer.notebookViewState.cells.some((c) => c.id === cellToFocus)
          ) {
            const view = buffer.notebookViewState
            const nextView = {
              ...view,
              focusedCellId: cellToFocus,
              // A persisted maximize on another cell would render only that
              // cell and swallow the scroll target — clear it, mirroring the
              // search-reveal path.
              ...(view.maximizedCellId && view.maximizedCellId !== cellToFocus
                ? { maximizedCellId: undefined }
                : {}),
            }
            await bufferStore.update(bufferId, { notebookViewState: nextView })
            return { ...buffer, notebookViewState: nextView }
          }
          return buffer
        })
        if (!target) return false
        await setActiveBuffer(target)
        return true
      },
      listNotebookBuffers() {
        return buffersRef.current
          .filter((b) => !!b.notebookViewState && typeof b.id === "number")
          .map((b) => ({
            bufferId: b.id as number,
            label: b.label,
            archived: !!b.archived,
          }))
      },
    })
    return () => unregisterWorkspace()
  }, [
    addBuffer,
    setActiveBuffer,
    archiveBuffer,
    deleteBuffer,
    updateBuffer,
    duplicateNotebookBuffer,
  ])

  return null
}
