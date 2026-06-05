import React, { useEffect, useRef } from "react"
import { useEditor } from "../../../providers/EditorProvider"
import {
  NotebookToolError,
  registerWorkspace,
  unregisterWorkspace,
  waitForController,
  type NotebookWorkspaceBufferMeta,
} from "../../../utils/notebookAIBridge"

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

  const buffersRef = useRef(buffers)
  buffersRef.current = buffers
  const activeBufferRef = useRef(activeBuffer)
  activeBufferRef.current = activeBuffer

  useEffect(() => {
    registerWorkspace({
      async createNotebook(label, signal) {
        // AI-created notebooks start with no cells; the agent populates via add_cell / apply_notebook_state.
        const buffer = await addBuffer({
          label: label ?? "Notebook",
          notebookViewState: { cells: [] },
        })
        if (!buffer?.id) {
          throw new Error("Failed to create notebook buffer")
        }
        await waitForController(buffer.id, 5000, signal)
        return { bufferId: buffer.id, label: buffer.label }
      },
      async duplicateNotebook(bufferId, signal) {
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
        const created = await duplicateNotebookBuffer(bufferId)
        if (!created?.id) {
          throw new NotebookToolError(
            "activation_failed",
            "Could not create the duplicate (tab limit reached).",
          )
        }
        await waitForController(created.id, 5000, signal)
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
        await archiveBuffer(bufferId)
        await updateBuffersPositions(
          remaining
            .sort((a, b) => a.position - b.position)
            .map((b, index) => ({ id: b.id as number, position: index })),
        )
      },
      async activateNotebook(bufferId) {
        const target = buffersRef.current.find(
          (b) => b.id === bufferId && !b.archived,
        )
        if (!target) return false
        await setActiveBuffer(target)
        return true
      },
      getBufferMeta(bufferId): NotebookWorkspaceBufferMeta {
        const b = buffersRef.current.find((x) => x.id === bufferId)
        if (!b) return { kind: "deleted" }
        if (b.archived) return { kind: "archived", label: b.label }
        if (!b.notebookViewState) return null
        const kind: "active" | "inactive" =
          activeBufferRef.current?.id === b.id ? "active" : "inactive"
        return {
          kind,
          label: b.label,
          notebookViewState: b.notebookViewState,
        }
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
