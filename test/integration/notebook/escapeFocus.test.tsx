// @vitest-environment jsdom
import React, { useRef, useState } from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import rootReducer from "../../../src/store/reducers"
import { Button } from "../../../src/components/Button"
import { Dialog } from "../../../src/components/Dialog"
import { Drawer } from "../../../src/components/Drawer"
import { useGridKeyboardNav } from "../../../src/components/ResultGrid/useGridKeyboardNav"
import { useCellWrapperInteractions } from "../../../src/scenes/Editor/Notebook/cells/useCellWrapperInteractions"
import { DrawerHost } from "../../../src/scenes/Schema/TableDetailsDrawer/test/DrawerHost"

const notebook = vi.hoisted(() => ({
  setFocusedCell: vi.fn(),
  moveCellUp: vi.fn(),
  moveCellDown: vi.fn(),
  getCellsSnapshot: () => [],
}))
vi.mock("../../../src/scenes/Editor/Notebook/NotebookProvider", () => ({
  useNotebookActions: () => notebook,
  useNotebookBufferId: () => 1,
}))
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../src/utils/notebooks/notebookAIBridge", () => ({
  emitUserAction: vi.fn(),
}))

const getData = () => 42
const getColumn = () => ({ name: "value", type: "INT" })

const Grid = () => {
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef(null)
  const nav = useGridKeyboardNav(1, 1, getData, getColumn, scrollRef)
  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      onKeyDown={nav.onKeyDown}
      onBlur={nav.onBlur}
      aria-activedescendant={nav.focusedCell ? "selected-value" : undefined}
    >
      <Button
        id="selected-value"
        onClick={() => {
          nav.onCellClick(0, 0)
          gridRef.current?.focus()
        }}
      >
        Select value
      </Button>
    </div>
  )
}

const NotebookCell = () => {
  const [focused, setFocused] = useState<string | null>(null)
  notebook.setFocusedCell.mockImplementation(setFocused)
  const { wrapperRef, wrapperHandlers } = useCellWrapperInteractions({
    cellId: "notebook-cell",
    layoutMode: "grid",
    isMaximized: false,
    isFocused: focused !== null,
  })
  return (
    <div
      ref={wrapperRef}
      {...wrapperHandlers}
      tabIndex={-1}
      data-hook="escape-notebook-cell"
      data-focused={focused !== null}
    >
      <Button>Focus notebook cell</Button>
      <Grid />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button>Cell menu</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content aria-label="Cell options">
            <DropdownMenu.Item>Configure</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <Button>Open modal</Button>
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Confirmation</Dialog.Title>
          <Dialog.Description>Modal owns Escape.</Dialog.Description>
          <Button>Modal action</Button>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}

// Clears itself on Escape without claiming it, like a field written before
// the Escape model. The drawer must still treat it as owning that press.
const UnclaimedField = ({ label }: { label: string }) => {
  const [value, setValue] = useState("")
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setValue("")
      }}
    />
  )
}

const Fixture = ({ plainGrid = false }: { plainGrid?: boolean }) => {
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState("")
  return (
    <>
      {plainGrid ? <Grid /> : <NotebookCell />}
      <UnclaimedField label="Schema filter" />
      <Drawer
        mode="side"
        title="Table details"
        trigger={<span />}
        open={open}
        onDismiss={() => setOpen(false)}
      >
        <input
          aria-label="Drawer filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && filter && !event.defaultPrevented) {
              event.preventDefault()
              setFilter("")
            }
          }}
        />
        <Button>Drawer action</Button>
      </Drawer>
    </>
  )
}

const mount = (plainGrid = false) =>
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <DrawerHost>
        <Fixture plainGrid={plainGrid} />
      </DrawerHost>
    </Provider>,
  )
const cell = () => document.querySelector('[data-hook="escape-notebook-cell"]')
const drawer = () => screen.queryByRole("dialog", { name: "Table details" })

describe("Escape focus hierarchy", () => {
  it("clears the grid selection, then the notebook cell, then closes the side drawer", async () => {
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Select value" }))
    expect(screen.getByRole("grid")).toHaveAttribute(
      "aria-activedescendant",
      "selected-value",
    )
    expect(cell()).toHaveAttribute("data-focused", "true")
    await userEvent.keyboard("{Escape}")
    expect(screen.getByRole("grid")).not.toHaveAttribute(
      "aria-activedescendant",
    )
    expect(cell()).toHaveAttribute("data-focused", "true")
    expect(drawer()).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(cell()).toHaveAttribute("data-focused", "false")
    expect(drawer()).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(drawer()).not.toBeInTheDocument()
  })

  it("also protects the regular SQL result grid before closing the drawer", async () => {
    mount(true)
    await userEvent.click(screen.getByRole("button", { name: "Select value" }))
    await userEvent.keyboard("{Escape}")
    expect(screen.getByRole("grid")).not.toHaveAttribute(
      "aria-activedescendant",
    )
    expect(drawer()).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(drawer()).not.toBeInTheDocument()
  })

  it("lets a Radix menu consume Escape before the notebook and drawer", async () => {
    mount()
    await userEvent.click(
      screen.getByRole("button", { name: "Focus notebook cell" }),
    )
    await userEvent.click(screen.getByRole("button", { name: "Cell menu" }))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(cell()).toHaveAttribute("data-focused", "true")
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(cell()).toHaveAttribute("data-focused", "true")
    expect(drawer()).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(cell()).toHaveAttribute("data-focused", "false")
    expect(drawer()).toBeInTheDocument()
  })

  it("preserves the priority of real modal dialogs", async () => {
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Open modal" }))
    expect(
      screen.getByRole("dialog", { name: "Confirmation" }),
    ).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(
      screen.queryByRole("dialog", { name: "Confirmation" }),
    ).not.toBeInTheDocument()
    expect(cell()).toHaveAttribute("data-focused", "true")
    expect(drawer()).toBeInTheDocument()
  })

  it("allows fields inside the drawer to clear before the drawer closes", async () => {
    mount()
    await userEvent.type(
      screen.getByRole("textbox", { name: "Drawer filter" }),
      "trades",
    )
    await userEvent.keyboard("{Escape}")
    expect(screen.getByRole("textbox", { name: "Drawer filter" })).toHaveValue(
      "",
    )
    expect(drawer()).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(drawer()).not.toBeInTheDocument()
  })

  it("closes the drawer that holds the focus before clearing a focused notebook cell", async () => {
    mount()
    await userEvent.click(
      screen.getByRole("button", { name: "Focus notebook cell" }),
    )
    expect(cell()).toHaveAttribute("data-focused", "true")
    screen.getByRole("button", { name: "Drawer action" }).focus()
    await userEvent.keyboard("{Escape}")
    expect(drawer()).not.toBeInTheDocument()
    expect(cell()).toHaveAttribute("data-focused", "true")
    await userEvent.keyboard("{Escape}")
    expect(cell()).toHaveAttribute("data-focused", "false")
  })

  // A browser event is not wrapped in act(): React 17 flushes the field's
  // cleared state before the event reaches window, unlike user-event.
  const pressNativeEscape = (target: HTMLElement) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    )

  it.each(["Schema filter", "Drawer filter"])(
    "lets the %s clear itself without also closing the drawer",
    async (label) => {
      mount()
      const field = screen.getByRole("textbox", { name: label })
      await userEvent.type(field, "trades")
      pressNativeEscape(field)
      await act(async () => {})
      expect(field).toHaveValue("")
      expect(drawer()).toBeInTheDocument()
      pressNativeEscape(field)
      await act(async () => {})
      expect(drawer()).not.toBeInTheDocument()
    },
  )
})
