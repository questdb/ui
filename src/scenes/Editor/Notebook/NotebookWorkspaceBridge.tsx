import React, { useContext, useEffect, useRef } from "react"
import { useEditor } from "../../../providers/EditorProvider"
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
import { bufferStore } from "../../../store/buffers"
import { emitAgentEdit } from "../../../utils/notebooks/agentActivity"
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
    duplicateNotebook: duplicateNotebookBuffer,
    updateBuffersPositions,
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
          throw new Error("Failed to create notebook buffer")
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
            "activation_failed",
            "Could not create the duplicate (tab limit reached).",
          )
        }
        // A background duplicate is fully cloned already, so it mounts no
        // controller — nothing to wait for.
        emitAgentEdit({ bufferId: created.id })
        return { bufferId: created.id, label: created.label }
      },
      async deleteNotebook(bufferId) {
        const target = buffersRef.current.find((b) => b.id === bufferId)
        if (!target) {
          throw new NotebookToolError(
            "deleted",
            `Notebook ${bufferId} no longer exists.`,
          )
        }
        if (!target.notebookViewState) {
          throw new NotebookToolError(
            "not_a_notebook",
            `Buffer ${bufferId} is not a notebook.`,
          )
        }
        if (target.archived) return
        const remaining = buffersRef.current.filter(
          (b) =>
            (!b.archived || b.isTemporary) &&
            typeof b.id === "number" &&
            b.id !== bufferId,
        )
        if (remaining.length === 0) {
          throw new NotebookToolError(
            "last_tab",
            "Cannot delete the only open tab. Create another notebook first, then delete this one.",
          )
        }
        await archiveBuffer(bufferId, "agent")
        await updateBuffersPositions(
          remaining
            .sort((a, b) => a.position - b.position)
            .map((b, index) => ({ id: b.id as number, position: index })),
        )
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
    duplicateNotebookBuffer,
    updateBuffersPositions,
  ])

  return null
}
