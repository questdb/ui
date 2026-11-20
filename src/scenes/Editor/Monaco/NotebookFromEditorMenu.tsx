import React from "react"
import { NotebookIcon } from "@phosphor-icons/react"
import { DropdownMenu } from "../../../components"
import { useEditor } from "../../../providers/EditorProvider"
import { BufferType, bufferTypeOf } from "../../../store/buffers"
import {
  exceedsCellLineLimit,
  MAX_NOTEBOOK_CELLS,
} from "../../../store/notebook"
import { useNotebookTransfer } from "../../../hooks/useNotebookTransfer"
import { splitEditorScript } from "../../../utils/notebooks/notebookTransfer"

export const NotebookFromEditorMenu = () => {
  const { activeBuffer, editorRef } = useEditor()
  const { transfer, busy } = useNotebookTransfer()
  if (
    bufferTypeOf(activeBuffer) !== BufferType.SQL ||
    activeBuffer.isPreviewBuffer
  )
    return null
  const script = editorRef.current?.getValue() ?? activeBuffer.value
  const statements = splitEditorScript(script)
  if (statements.length === 0) return null
  const selected = statements.slice(0, MAX_NOTEBOOK_CELLS)
  const canCreate = selected.every((sql) => !exceedsCellLineLimit(sql))
  return (
    <DropdownMenu.Item
      icon={<NotebookIcon size={16} />}
      onSelect={() =>
        void transfer({
          queries: selected.map((sql) => ({ sql })),
          source: "editor_split",
          sourceBufferId: activeBuffer.id,
        })
      }
      disabled={busy || !canCreate}
      subtitle={
        !canCreate
          ? "A query exceeds the cell size limit"
          : statements.length > MAX_NOTEBOOK_CELLS
            ? `First ${MAX_NOTEBOOK_CELLS} of ${statements.length} queries`
            : undefined
      }
      data-hook="notebook-from-editor"
    >
      Convert to notebook
    </DropdownMenu.Item>
  )
}
