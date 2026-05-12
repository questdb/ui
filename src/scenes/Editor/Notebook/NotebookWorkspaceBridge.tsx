import React, { useEffect, useRef } from "react"
import { useEditor } from "../../../providers/EditorProvider"
import {
  registerWorkspace,
  unregisterWorkspace,
  waitForController,
  type NotebookWorkspaceBufferMeta,
} from "../../../utils/notebookAIBridge"

export const NotebookWorkspaceBridge: React.FC = () => {
  const { buffers, activeBuffer, addBuffer, setActiveBuffer } = useEditor()

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
  }, [addBuffer, setActiveBuffer])

  return null
}
