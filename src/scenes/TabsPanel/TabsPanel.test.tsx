// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { Button } from "../../components/Button"
import { Tooltip } from "../../components/Tooltip"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../test/component"

const mocks = vi.hoisted(() => ({
  editor: {
    buffers: [
      { id: 1, label: "SQL 1", value: "", position: 0 },
      { id: 2, label: "SQL 2", value: "", position: 1 },
    ] as unknown[],
    activeBuffer: { id: 1 } as unknown,
    setActiveBuffer: vi.fn(),
    closeBuffer: vi.fn(),
    deleteBuffer: vi.fn(),
    reorderBuffer: vi.fn(),
    openExampleDashboard: vi.fn(),
    openingExampleIds: [] as string[],
  },
  useEditor: vi.fn(),
  settings: {
    consoleConfig: {
      exampleDashboards: [{ id: "ex1", title: "Example One", path: "/x" }],
    },
  },
}))

vi.mock("../../providers", async (actual) => ({
  ...(await actual<object>()),
  useEditor: mocks.useEditor,
  useSettings: () => mocks.settings,
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

import { TabsPanel } from "./index"

const sectionHeader = (hook: string) =>
  document.querySelector<HTMLElement>(
    `[data-hook="${hook}"] [role="button"][aria-expanded]`,
  )

const switchTo = (mode: "Groups" | "List") =>
  fireEvent.click(screen.getByRole("button", { name: mode }))

const getSort = () => screen.getByRole("button", { name: /^Sort open tabs:/ })

const openSort = () => fireEvent.keyDown(getSort(), { key: "Enter" })

const selectSort = async (label: string) => {
  openSort()
  fireEvent.click(await screen.findByRole("menuitemradio", { name: label }))
  await waitFor(() => {
    const trigger = getSort()
    expect(trigger).toHaveAccessibleName(`Sort open tabs: ${label}`)
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
}

const expectRows = (section: string, titles: string[]) => {
  const list = within(getHook(section))
  expect(list.queryAllByRole("listitem")).toEqual(
    titles.map((title) => list.getByText(title).closest('[role="listitem"]')),
  )
}

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
)
const scrollIntoView = vi.fn()

afterEach(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    )
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView")
  }
})

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  })
  scrollIntoView.mockClear()
  mocks.editor.buffers = [
    { id: 1, label: "SQL 1", value: "", position: 0 },
    { id: 2, label: "SQL 2", value: "", position: 1 },
  ]
  mocks.editor.activeBuffer = { id: 1 }
  localStorage.clear()
  mocks.useEditor.mockReset()
  mocks.useEditor.mockImplementation(() => mocks.editor)
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

describe("TabsPanel", () => {
  it("does not render or read the tabs while it is closed", () => {
    // Given the panel is closed
    renderComponent(<TabsPanel open={false} />)

    // Then no row is rendered and the editor context is never read, so
    // editor changes (every keystroke) do not re-render the panel
    expect(document.querySelector('[data-hook="tabs-panel-row"]')).toBeNull()
    expect(mocks.useEditor).not.toHaveBeenCalled()
  })

  it("does not carry a collapsed section from Groups into List", () => {
    // Given the Example dashboards section is collapsed in Groups view
    renderComponent(<TabsPanel open />)
    fireEvent.click(sectionHeader("tabs-panel-examples")!)

    // When the user switches to List view
    switchTo("List")

    // Then the Open section is expanded and lists the open tabs
    expect(
      sectionHeader("tabs-panel-open")?.getAttribute("aria-expanded"),
    ).toBe("true")
    expect(
      document.querySelector('[data-hook="tabs-panel-open"]')?.textContent,
    ).toContain("SQL 1")
  })

  it("does not carry a collapsed section from List into Groups", () => {
    // Given the Open section is collapsed in List view
    renderComponent(<TabsPanel open />)
    switchTo("List")
    fireEvent.click(sectionHeader("tabs-panel-open")!)

    // When the user switches back to Groups view
    switchTo("Groups")

    // Then the Example dashboards section is expanded
    expect(
      sectionHeader("tabs-panel-examples")?.getAttribute("aria-expanded"),
    ).toBe("true")
  })
})

describe("TabsPanel filtering and sorting", () => {
  it("filters Groups by title and restores the folders when cleared", () => {
    mocks.editor.buffers = [
      { id: 1, label: "Alpha SQL", position: 0 },
      { id: 2, label: "Prices SQL", position: 1 },
      {
        id: 3,
        label: "Daily Alpha",
        position: 2,
        notebookViewState: { cells: [] },
      },
      { id: 4, label: "Closed Alpha", position: -1, archived: true },
    ]
    renderComponent(<TabsPanel open />)

    expect(queryHook("tabs-panel-group-metrics")).not.toBeInTheDocument()
    fireEvent.click(sectionHeader("tabs-panel-group-notebook")!)
    expectRows("tabs-panel-group-notebook", ["Daily Alpha"])
    fireEvent.click(sectionHeader("tabs-panel-group-notebook")!)
    expectRows("tabs-panel-group-notebook", [])
    fireEvent.click(sectionHeader("tabs-panel-group-notebook")!)
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Include closed tabs" }),
    )

    const filter = screen.getByRole("textbox", { name: "Filter tabs" })
    fireEvent.change(filter, { target: { value: "aLPhA" } })
    expectRows("tabs-panel-group-sql", ["Alpha SQL", "Closed Alpha"])
    expectRows("tabs-panel-group-notebook", ["Daily Alpha"])
    expect(screen.getByText("No examples match")).toBeInTheDocument()

    fireEvent.change(filter, { target: { value: "no match" } })
    expect(queryHook("tabs-panel-group-sql")).not.toBeInTheDocument()
    expect(queryHook("tabs-panel-group-notebook")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Clear tab filter" }))
    expect(filter).toHaveValue("")
    expectRows("tabs-panel-group-sql", [
      "Alpha SQL",
      "Prices SQL",
      "Closed Alpha",
    ])
    expect(sectionHeader("tabs-panel-group-notebook")).toBeInTheDocument()
  })

  it("offers sorting only in List and remembers the selected view and sort", async () => {
    const first = renderComponent(<TabsPanel open />)
    expect(screen.getByRole("button", { name: "Groups" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(
      screen.queryByRole("button", { name: /^Sort open tabs:/ }),
    ).not.toBeInTheDocument()

    switchTo("List")
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(
      screen.queryByRole("checkbox", { name: "Include closed tabs" }),
    ).not.toBeInTheDocument()
    expect(getSort()).toHaveAccessibleName("Sort open tabs: Alphabetical (A-Z)")
    await selectSort("Position")
    first.unmount()

    renderComponent(<TabsPanel open />)
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(getSort()).toHaveAccessibleName("Sort open tabs: Position")

    switchTo("Groups")
    expect(
      screen.queryByRole("button", { name: /^Sort open tabs:/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", { name: "Include closed tabs" }),
    ).toBeInTheDocument()
  })

  it("applies every sort to the filtered open tabs and keeps matching closed tabs newest first", async () => {
    mocks.editor.buffers = [
      { id: 1, label: "Trades Zulu", position: 0 },
      { id: 2, label: "Trades Alpha", position: 1 },
      { id: 3, label: "Prices", position: 2 },
      { id: 4, label: "Night trades Mike", position: 4 },
      { id: 5, label: "Trades Bravo", position: 3 },
      {
        id: 6,
        label: "Trades Report Z",
        position: -1,
        archived: true,
        archivedAt: 200,
      },
      {
        id: 7,
        label: "Trades Report A",
        position: -1,
        archived: true,
        archivedAt: 100,
      },
      {
        id: 8,
        label: "Prices archive",
        position: -1,
        archived: true,
        archivedAt: 300,
      },
    ]
    renderComponent(<TabsPanel open />)
    switchTo("List")
    const filter = screen.getByRole("textbox", { name: "Filter tabs" })
    fireEvent.change(filter, { target: { value: "TradeS" } })

    const alphabetical = [
      "Night trades Mike",
      "Trades Alpha",
      "Trades Bravo",
      "Trades Zulu",
    ]
    const sorts = [
      { label: "Alphabetical (A-Z)", expected: alphabetical },
      { label: "Alphabetical (Z-A)", expected: [...alphabetical].reverse() },
      {
        label: "Newest first",
        expected: [
          "Trades Bravo",
          "Night trades Mike",
          "Trades Alpha",
          "Trades Zulu",
        ],
      },
      {
        label: "Oldest first",
        expected: [
          "Trades Zulu",
          "Trades Alpha",
          "Night trades Mike",
          "Trades Bravo",
        ],
      },
      {
        label: "Position",
        expected: [
          "Trades Zulu",
          "Trades Alpha",
          "Trades Bravo",
          "Night trades Mike",
        ],
      },
    ]
    expectRows("tabs-panel-open", alphabetical)
    openSort()
    const options = await screen.findAllByRole("menuitemradio")
    expect(options).toHaveLength(sorts.length)
    sorts.forEach(({ label }, index) =>
      expect(options[index]).toHaveAccessibleName(label),
    )
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    await waitFor(() => expect(getSort()).toHaveFocus())

    for (const { label, expected } of sorts) {
      await selectSort(label)
      expect(filter).toHaveValue("TradeS")
      expectRows("tabs-panel-open", expected)
      expectRows("tabs-panel-closed", ["Trades Report Z", "Trades Report A"])
      expect(
        screen.queryByTitle("Drag to reorder tabs"),
      ).not.toBeInTheDocument()
    }

    fireEvent.change(filter, { target: { value: "no match" } })
    expect(screen.getByText("No open tabs match")).toBeInTheDocument()
    expect(screen.getByText("No closed tabs match")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Clear tab filter" }))
    expectRows("tabs-panel-open", [
      "Trades Zulu",
      "Trades Alpha",
      "Prices",
      "Trades Bravo",
      "Night trades Mike",
    ])
    expect(screen.getAllByTitle("Drag to reorder tabs")).toHaveLength(5)

    await selectSort("Alphabetical (A-Z)")
    expect(screen.queryByTitle("Drag to reorder tabs")).not.toBeInTheDocument()
  })

  it("returns focus to the sort trigger on Escape", async () => {
    renderComponent(<TabsPanel open />)
    switchTo("List")

    const trigger = getSort()
    trigger.focus()
    openSort()
    const menu = await screen.findByRole("menu")
    fireEvent.keyDown(menu, { key: "Escape" })

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
})

describe("TabsPanel active tab reveal", () => {
  const expectRevealed = (section: string, rowSelector: string) => {
    expect(sectionHeader(section)).toHaveAttribute("aria-expanded", "true")
    const row = document.querySelector(rowSelector)
    expect(row).not.toBeNull()
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "nearest",
      inline: "nearest",
    })
    expect(scrollIntoView.mock.instances.at(-1)).toBe(row)
  }

  it("reveals the active row after opening its group and preserves keyboard focus", () => {
    const { rerender } = renderComponent(<TabsPanel open />)
    fireEvent.click(sectionHeader("tabs-panel-group-sql")!)
    const filter = document.querySelector<HTMLInputElement>(
      '[data-hook="tabs-panel-filter"]',
    )!
    filter.focus()
    scrollIntoView.mockClear()
    mocks.editor.activeBuffer = { id: 2 }
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-group-sql", '[data-buffer-id="2"]')
    expect(document.activeElement).toBe(filter)
  })

  it("does not reopen or scroll on an unrelated buffer update", () => {
    const { rerender } = renderComponent(<TabsPanel open />)
    fireEvent.click(sectionHeader("tabs-panel-group-sql")!)
    scrollIntoView.mockClear()
    mocks.editor.buffers = [
      { id: 1, label: "Renamed", value: "select 42", position: 0 },
      { id: 2, label: "SQL 2", value: "", position: 1 },
    ]
    rerender(<TabsPanel open />)
    expect(sectionHeader("tabs-panel-group-sql")).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("reveals an example, then its personal notebook when the link is detached", () => {
    const notebook = {
      id: 3,
      label: "Example One",
      value: "",
      position: 2,
      notebookViewState: { cells: [] },
    }
    mocks.editor.buffers.push({ ...notebook, templateId: "ex1" })
    const { rerender } = renderComponent(<TabsPanel open />)
    fireEvent.click(sectionHeader("tabs-panel-examples")!)
    mocks.editor.activeBuffer = { id: 3 }
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-examples", '[data-example-id="ex1"]')
    mocks.editor.buffers = [...mocks.editor.buffers.slice(0, 2), notebook]
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-group-notebook", '[data-buffer-id="3"]')
  })

  it("expands Open and Closed in List mode when their active tab changes", () => {
    mocks.editor.buffers.push({
      id: 3,
      label: "Closed SQL",
      value: "select 3",
      position: -1,
      archived: true,
      isTemporary: true,
    })
    const { rerender } = renderComponent(<TabsPanel open />)
    switchTo("List")
    fireEvent.click(sectionHeader("tabs-panel-open")!)
    fireEvent.click(sectionHeader("tabs-panel-closed")!)
    mocks.editor.activeBuffer = { id: 2 }
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-open", '[data-buffer-id="2"]')
    expect(sectionHeader("tabs-panel-closed")).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    mocks.editor.activeBuffer = { id: 3 }
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-closed", '[data-buffer-id="3"]')
  })

  it("reveals the current tab when the panel opens and the view mode changes", () => {
    const { rerender } = renderComponent(<TabsPanel open={false} />)
    mocks.editor.activeBuffer = { id: 2 }
    rerender(<TabsPanel open />)
    expectRevealed("tabs-panel-group-sql", '[data-buffer-id="2"]')
    switchTo("List")
    expectRevealed("tabs-panel-open", '[data-buffer-id="2"]')
  })

  it("respects the filter and reveals the active tab when it becomes visible", () => {
    const { rerender } = renderComponent(<TabsPanel open />)
    const filter = document.querySelector<HTMLInputElement>(
      '[data-hook="tabs-panel-filter"]',
    )!
    fireEvent.change(filter, { target: { value: "SQL 1" } })
    scrollIntoView.mockClear()
    mocks.editor.activeBuffer = { id: 2 }
    rerender(<TabsPanel open />)
    expect(filter.value).toBe("SQL 1")
    expect(scrollIntoView).not.toHaveBeenCalled()
    fireEvent.change(filter, { target: { value: "" } })
    expectRevealed("tabs-panel-group-sql", '[data-buffer-id="2"]')
  })
})

describe("Escape overlay integration", () => {
  it("lets a Radix overlay close before clearing the focused tab filter", () => {
    const onOpenChange = vi.fn()
    const TooltipWithOpenState = () => {
      const [open, setOpen] = React.useState(true)
      return (
        <Tooltip
          content="Navigation hint"
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        >
          <Button>Show navigation hint</Button>
        </Tooltip>
      )
    }
    renderComponent(
      <>
        <TabsPanel open />
        <TooltipWithOpenState />
      </>,
    )
    const input = document.querySelector<HTMLInputElement>(
      '[data-hook="tabs-panel-filter"]',
    )!
    input.focus()
    fireEvent.change(input, { target: { value: "SQL 1" } })
    expect(input.value).toBe("SQL 1")

    fireEvent.keyDown(input, { key: "Escape" })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(input.value).toBe("SQL 1")

    fireEvent.keyDown(input, { key: "Escape" })
    expect(input.value).toBe("")
  })
})
