import React, { useEffect } from "react"
import {
  ClipboardTextIcon,
  CopyIcon,
  ScissorsIcon,
  SelectionBackgroundIcon,
} from "@phosphor-icons/react"
import { DropdownMenu } from "../../../../components"
import { Trash } from "../../../../components/icons"
import { getCopiedCells, useCopiedCells } from "./copiedCellsStore"
import {
  CELL_SHORTCUT_LABELS,
  cellShortcutOf,
  isCellShortcutHandledElsewhere,
} from "./cellShortcut"
import { useCellEditActions } from "./useCellEditActions"

type Props = {
  cellId: string
  showDuplicate: boolean
  showDelete: boolean
  onClose: () => void
}

// Rendered only while the cell menu is open. Focus then sits in the menu,
// outside the notebook, so the menu runs the shortcuts on its own cell.
// The document listener runs before the notebook's window listener, and
// preventDefault keeps that one out. Paste does what "Paste cell below"
// does: it pastes the last cell copied in this tab, as the open menu keeps
// focus and so the browser paste never reaches the notebook.
const useMenuShortcuts = (cellId: string, onClose: () => void) => {
  const { copyCell, cutCell, duplicateCell, deleteCell, pasteCells } =
    useCellEditActions()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = cellShortcutOf(event)
      if (
        shortcut !== "copy" &&
        shortcut !== "cut" &&
        shortcut !== "duplicate" &&
        shortcut !== "delete" &&
        shortcut !== "paste"
      ) {
        return
      }
      if (
        isCellShortcutHandledElsewhere(
          event,
          shortcut,
          document.activeElement,
          window.getSelection(),
        )
      ) {
        return
      }
      if (shortcut === "paste") {
        const copiedCells = getCopiedCells()
        if (!copiedCells) return
        event.preventDefault()
        onClose()
        pasteCells(copiedCells, cellId, "shortcut")
        return
      }
      event.preventDefault()
      // Close first: a cut or delete unmounts the menu with its cell.
      onClose()
      const actOnCell = {
        copy: copyCell,
        cut: cutCell,
        duplicate: duplicateCell,
        delete: deleteCell,
      }
      void actOnCell[shortcut](cellId, "shortcut")
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [
    cellId,
    onClose,
    copyCell,
    cutCell,
    duplicateCell,
    deleteCell,
    pasteCells,
  ])
}

export const CellEditMenuItems: React.FC<Props> = ({
  cellId,
  showDuplicate,
  showDelete,
  onClose,
}) => {
  const copiedCells = useCopiedCells()
  const { copyCell, cutCell, duplicateCell, deleteCell, pasteCells } =
    useCellEditActions()
  useMenuShortcuts(cellId, onClose)

  return (
    <>
      {showDuplicate && (
        <DropdownMenu.Item
          onSelect={() => void duplicateCell(cellId, "menu")}
          icon={<SelectionBackgroundIcon size={16} />}
        >
          {`Duplicate (${CELL_SHORTCUT_LABELS.duplicate})`}
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        onSelect={() => copyCell(cellId, "menu")}
        icon={<CopyIcon size={16} />}
      >
        {`Copy cell (${CELL_SHORTCUT_LABELS.copy})`}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => cutCell(cellId, "menu")}
        icon={<ScissorsIcon size={16} />}
      >
        {`Cut cell (${CELL_SHORTCUT_LABELS.cut})`}
      </DropdownMenu.Item>
      {copiedCells && (
        <DropdownMenu.Item
          onSelect={() => pasteCells(copiedCells, cellId, "menu")}
          icon={<ClipboardTextIcon size={16} />}
        >
          {`Paste cell below (${CELL_SHORTCUT_LABELS.paste})`}
        </DropdownMenu.Item>
      )}
      {showDelete && (
        <DropdownMenu.Item
          tone="danger"
          onSelect={() => deleteCell(cellId, "menu")}
          icon={<Trash size={16} />}
        >
          {`Delete (${CELL_SHORTCUT_LABELS.delete})`}
        </DropdownMenu.Item>
      )}
    </>
  )
}
