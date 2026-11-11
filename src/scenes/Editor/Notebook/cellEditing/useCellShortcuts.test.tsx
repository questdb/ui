// @vitest-environment jsdom
import React, { useEffect, useMemo, useRef, useState } from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { Button, DropdownMenu } from "../../../../components"
import type { NotebookCell } from "../../../../store/notebook"
import type { NotebookActions } from "../NotebookProvider"
import {
  CELL_CLIPBOARD_MIME,
  serializeCellClipboardPayload,
} from "./cellClipboardPayload"
import { getCopiedCells } from "./copiedCellsStore"
import { CellEditMenuItems } from "./CellEditMenuItems"
import { useCellShortcuts } from "./useCellShortcuts"
import { ToastContainer, toast } from "../../../../components/Toast"
import type { HistoryStep } from "../undo/stepUndoHistory"
import {
  __resetNotebookUndoHistoryForTests,
  clearNotebookUndoHistory,
  recordUndoEntry,
} from "../undo/notebookUndoHistory"

const notebook = vi.hoisted(() => ({
  actions: null as Partial<NotebookActions> | null,
}))

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => notebook.actions,
  useNotebookBufferId: () => 1,
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

const cell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: `SELECT '${id}'`,
})

const CellMenu: React.FC<{ cellId: string }> = ({ cellId }) => {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button>{`More actions ${cellId}`}</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content>
          <CellEditMenuItems
            cellId={cellId}
            showDuplicate
            showDelete
            onClose={() => setOpen(false)}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const nothingToStep = (): HistoryStep => ({ kind: "empty" })

type Props = {
  selectedCellId?: string
  drawerOnCellId?: string
  onPaste?: (afterCellId: string | undefined) => void
  onUndo?: () => HistoryStep
}

const FakeNotebook: React.FC<Props> = ({
  selectedCellId,
  drawerOnCellId,
  onPaste,
  onUndo = nothingToStep,
}) => {
  const [cells, setCells] = useState([cell("a"), cell("b")])
  const [focusedCellId, setFocusedCellId] = useState<string | null>(
    selectedCellId ?? null,
  )
  const cellsRef = useRef(cells)

  notebook.actions = useMemo<Partial<NotebookActions>>(
    () => ({
      getCellsSnapshot: () => cellsRef.current,
      getSettings: () => ({}),
      deleteCell: (cellId) =>
        setCells((previous) => previous.filter((c) => c.id !== cellId)),
      duplicateCell: (cellId) => {
        const copyId = `${cellId}-copy`
        setCells((previous) =>
          previous.flatMap((c) => (c.id === cellId ? [c, cell(copyId)] : [c])),
        )
        return Promise.resolve(copyId)
      },
      pasteCells: (afterCellId) => {
        onPaste?.(afterCellId)
        return []
      },
      undo: onUndo,
      redo: nothingToStep,
      setFocusedCell: setFocusedCellId,
    }),
    [onPaste, onUndo],
  )
  useCellShortcuts(focusedCellId)

  useEffect(() => {
    cellsRef.current = cells
  }, [cells])

  return (
    <div data-notebook-root>
      <textarea aria-label="SQL editor" />

      {cells.map(({ id }) => (
        <div key={id} data-notebook-cell data-cell-id={id} tabIndex={-1}>
          <CellMenu cellId={id} />
          {drawerOnCellId === id && (
            <div role="dialog" aria-modal="true" aria-label="Chart settings" />
          )}
        </div>
      ))}
    </div>
  )
}

// The browser pastes into the focused sink; jsdom has no clipboard.
const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )

const pasteCopiedCells = () => {
  const copied = getCopiedCells()
  const sink = document.querySelector("[data-clipboard-paste-sink]")
  if (!copied || !sink) return
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) =>
        type === CELL_CLIPBOARD_MIME
          ? serializeCellClipboardPayload(copied)
          : "",
    },
  })
  sink.dispatchEvent(event)
}

beforeEach(() => {
  __resetNotebookUndoHistoryForTests()
  Object.defineProperty(document, "execCommand", {
    value: vi.fn(() => true),
    configurable: true,
  })
})

describe("useCellShortcuts", () => {
  it("pastes with the shortcut right after a cut from the cell menu", async () => {
    // Given a cell cut from its menu, which lives outside the notebook
    const onPaste = vi.fn()
    renderComponent(<FakeNotebook onPaste={onPaste} />)
    await userEvent.click(screen.getByText("More actions a"))
    await userEvent.click(screen.getByRole("menuitem", { name: /^Cut cell/ }))
    await nextFrame()

    // When the user presses Cmd+V without clicking anywhere
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "v",
      metaKey: true,
    })
    pasteCopiedCells()

    // Then the cut cell is pasted after the cell that took its place
    expect(onPaste).toHaveBeenCalledWith("b")
  })

  it("pastes below the cell whose menu is open", async () => {
    // Given cell "b" copied, and the menu of cell "a" open
    const onPaste = vi.fn()
    renderComponent(<FakeNotebook selectedCellId="b" onPaste={onPaste} />)
    fireEvent.keyDown(document.body, { key: "c", metaKey: true })
    await userEvent.click(screen.getByText("More actions a"))

    // When the user presses Cmd+V in the menu
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "v",
      metaKey: true,
    })

    // Then the copied cell goes below "a", and the menu closes
    expect(onPaste).toHaveBeenCalledWith("a")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("duplicates the selected cell with Cmd+D and selects the copy", async () => {
    // Given cell "a" selected
    renderComponent(<FakeNotebook selectedCellId="a" />)

    // When the user presses Cmd+D
    const notHandled = fireEvent.keyDown(document.body, {
      key: "d",
      metaKey: true,
    })
    await nextFrame()

    // Then the copy sits below "a" and has focus, and the browser does not
    // bookmark the page
    const cellIds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-notebook-cell]"),
      (node) => node.dataset.cellId,
    )
    expect(cellIds).toEqual(["a", "a-copy", "b"])
    expect(document.activeElement).toHaveAttribute("data-cell-id", "a-copy")
    expect(notHandled).toBe(false)
  })

  it("duplicates the cell whose menu is open with Cmd+D", async () => {
    // Given the menu of cell "b" open
    renderComponent(<FakeNotebook selectedCellId="a" />)
    await userEvent.click(screen.getByText("More actions b"))

    // When the user presses Cmd+D in the menu
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "d",
      metaKey: true,
    })
    await nextFrame()

    // Then "b" is duplicated, not the selected "a", and the menu closes
    expect(screen.getByText("More actions b-copy")).toBeInTheDocument()
    expect(screen.queryByText("More actions a-copy")).toBeNull()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("deletes the selected cell and selects the next one", async () => {
    // Given a notebook with cell "a" selected
    renderComponent(<FakeNotebook selectedCellId="a" />)

    // When the user presses Delete
    fireEvent.keyDown(document.body, { key: "Delete" })
    await nextFrame()

    // Then "a" is gone and "b" has focus
    expect(screen.queryByText("More actions a")).toBeNull()
    expect(document.activeElement).toHaveAttribute("data-cell-id", "b")
  })

  it("runs a shortcut on the cell whose menu is open", async () => {
    // Given cell "a" selected and the menu of cell "b" open
    renderComponent(<FakeNotebook selectedCellId="a" />)
    await userEvent.click(screen.getByText("More actions b"))

    // When the user presses Cmd+Backspace in the menu
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Backspace",
      metaKey: true,
    })

    // Then the menu's cell is deleted, not the selected one, and the menu closes
    expect(screen.queryByText("More actions b")).toBeNull()
    expect(screen.getByText("More actions a")).toBeInTheDocument()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("undoes with Cmd+Z and selects the cell that came back", async () => {
    // Given a notebook whose last change can be undone
    const onUndo = vi.fn(
      (): HistoryStep => ({ kind: "inserted", cellIds: ["b"] }),
    )
    renderComponent(<FakeNotebook onUndo={onUndo} />)

    // When the user presses Cmd+Z with no field focused
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })
    await nextFrame()

    // Then the notebook undoes, and the restored cell has focus
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toHaveAttribute("data-cell-id", "b")
  })

  it("brings a moved cell into view after an undo", async () => {
    // Given a notebook whose last change moved cell "b"
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const onUndo = vi.fn(
      (): HistoryStep => ({
        kind: "arranged",
        cellIds: ["b"],
        arrangement: { order: ["a", "b"] },
      }),
    )
    renderComponent(<FakeNotebook onUndo={onUndo} />)

    // When the user presses Cmd+Z
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })
    await nextFrame()

    // Then "b" is selected and scrolled into view
    expect(document.activeElement).toHaveAttribute("data-cell-id", "b")
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })
  })

  it("keeps the selection when the undone cell is not on screen", async () => {
    // Given cell "a" selected, and an undo that changes a cell not shown,
    // e.g. behind a maximized cell
    const onUndo = vi.fn(
      (): HistoryStep => ({
        kind: "arranged",
        cellIds: ["hidden"],
        arrangement: { order: ["a", "b", "hidden"] },
      }),
    )
    renderComponent(<FakeNotebook selectedCellId="a" onUndo={onUndo} />)
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })
    await nextFrame()

    // When the user presses Delete
    fireEvent.keyDown(document.body, { key: "Delete" })

    // Then the selected cell is deleted, not one the user cannot see
    expect(screen.queryByText("More actions a")).toBeNull()
  })

  it("leaves Cmd+Z to a focused text field", () => {
    // Given focus in an editor inside the notebook
    const onUndo = vi.fn(nothingToStep)
    renderComponent(<FakeNotebook onUndo={onUndo} />)
    const editor = screen.getByLabelText("SQL editor")
    editor.focus()

    // When the user presses Cmd+Z
    fireEvent.keyDown(editor, { key: "z", metaKey: true })

    // Then the field undoes its own text, not the notebook
    expect(onUndo).not.toHaveBeenCalled()
  })

  it.each([
    ["undoes the delete from its toast", false, 1],
    ["warns instead of undoing after a later change", true, 0],
  ])("%s", async (_, laterChange, undoCalls) => {
    // Given a deleted cell and its undo toast
    const onUndo = vi.fn(nothingToStep)
    renderComponent(
      <>
        <FakeNotebook selectedCellId="a" onUndo={onUndo} />
        <ToastContainer />
      </>,
    )
    fireEvent.keyDown(document.body, { key: "Delete" })
    const undoButton = await screen.findByRole("button", { name: "Undo" })
    if (laterChange) {
      recordUndoEntry(1, { change: "insert", placements: [], variables: [] })
    }

    // When the user clicks Undo on the toast
    await userEvent.click(undoButton)

    // Then only the delete's own toast undoes it, and a stale one says so
    expect(onUndo).toHaveBeenCalledTimes(undoCalls)
    if (laterChange) {
      expect(
        await screen.findByText("Cannot undo this change."),
      ).toBeInTheDocument()
    }
  })

  it("closes the undo toast when the history is cleared", async () => {
    // Given a deleted cell and its undo toast
    const dismiss = vi.spyOn(toast, "dismiss")
    renderComponent(
      <>
        <FakeNotebook selectedCellId="a" onUndo={vi.fn(nothingToStep)} />
        <ToastContainer />
      </>,
    )
    fireEvent.keyDown(document.body, { key: "Delete" })
    await screen.findByRole("button", { name: "Undo" })
    dismiss.mockClear()

    // When an agent edit clears the notebook's undo history
    act(() => clearNotebookUndoHistory(1))

    // Then the toast is dismissed, so its Undo cannot silently do nothing.
    // (jsdom never ends the exit animation, so the node itself stays.)
    expect(dismiss).toHaveBeenCalledTimes(1)
    dismiss.mockRestore()
  })

  it.each([
    ["Delete", { key: "Delete" }],
    ["Cmd+Z", { key: "z", metaKey: true }],
  ])("leaves %s alone while the cell's settings drawer is open", (_, init) => {
    // Given cell "a" selected under its open settings drawer, with focus
    // outside the drawer, e.g. after a click on its backdrop
    const onUndo = vi.fn(nothingToStep)
    renderComponent(
      <FakeNotebook selectedCellId="a" drawerOnCellId="a" onUndo={onUndo} />,
    )

    // When the user presses the key
    fireEvent.keyDown(document.body, init)

    // Then the notebook does nothing behind the drawer
    expect(screen.getByText("More actions a")).toBeInTheDocument()
    expect(onUndo).not.toHaveBeenCalled()
  })

  it("leaves Cmd+Z alone on any cell while a drawer is open", () => {
    // Given cell "b" selected while cell "a" has its settings drawer open
    const onUndo = vi.fn(nothingToStep)
    renderComponent(
      <FakeNotebook selectedCellId="b" drawerOnCellId="a" onUndo={onUndo} />,
    )

    // When the user presses Cmd+Z
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })

    // Then nothing is undone, as an undo can remove the cell under the drawer
    expect(onUndo).not.toHaveBeenCalled()
  })

  it("keeps the shortcuts of other cells while one has its drawer open", () => {
    // Given cell "b" selected while cell "a" has its settings drawer open
    renderComponent(<FakeNotebook selectedCellId="b" drawerOnCellId="a" />)

    // When the user presses Cmd+C
    fireEvent.keyDown(document.body, { key: "c", metaKey: true })

    // Then cell "b" is copied
    expect(getCopiedCells()?.cells[0].cell.id).toBe("b")
  })
})
