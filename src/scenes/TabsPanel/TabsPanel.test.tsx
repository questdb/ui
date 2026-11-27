// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  document.querySelector<HTMLElement>(`[data-hook="${hook}"][role="treeitem"]`)

const toggleSection = (hook: string) =>
  fireEvent.click(
    within(getHook(hook)).getByText(
      sectionHeader(hook)!.getAttribute("aria-label")!,
    ),
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
  expect(list.queryAllByRole("treeitem")).toEqual(
    titles.map((title) => list.getByText(title).closest('[role="treeitem"]')),
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
  mocks.editor.setActiveBuffer.mockClear()
  mocks.editor.closeBuffer.mockClear()
  mocks.editor.reorderBuffer.mockClear()
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
    toggleSection("tabs-panel-examples")

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
    toggleSection("tabs-panel-open")

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
    toggleSection("tabs-panel-group-notebook")
    expectRows("tabs-panel-group-notebook", ["Daily Alpha"])
    toggleSection("tabs-panel-group-notebook")
    expectRows("tabs-panel-group-notebook", [])
    toggleSection("tabs-panel-group-notebook")
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

describe("TabsPanel keyboard navigation", () => {
  it("moves through visible rows and section headers in Groups", () => {
    mocks.editor.buffers.push({
      id: 3,
      label: "Daily notebook",
      position: 2,
      notebookViewState: { cells: [] },
    })
    renderComponent(<TabsPanel open />)
    const examples = sectionHeader("tabs-panel-examples")!
    const notebooks = sectionHeader("tabs-panel-group-notebook")!
    const editors = sectionHeader("tabs-panel-group-sql")!
    const example = screen.getByRole("treeitem", { name: "Example One" })
    const lastRow = screen.getByRole("treeitem", { name: "SQL 2" })

    examples.focus()
    fireEvent.keyDown(examples, { key: "ArrowDown" })
    expect(example).toHaveFocus()
    fireEvent.keyDown(example, { key: "ArrowRight" })
    expect(notebooks).toHaveFocus()
    expect(notebooks).toHaveAttribute("aria-expanded", "false")
    fireEvent.keyDown(notebooks, { key: "ArrowDown" })
    expect(editors).toHaveFocus()
    fireEvent.keyDown(editors, { key: "ArrowUp" })
    expect(notebooks).toHaveFocus()

    fireEvent.keyDown(notebooks, { key: "ArrowRight" })
    expect(notebooks).toHaveAttribute("aria-expanded", "true")
    expect(notebooks).toHaveFocus()
    fireEvent.keyDown(notebooks, { key: "ArrowRight" })
    const notebook = screen.getByRole("treeitem", { name: "Daily notebook" })
    expect(notebook).toHaveFocus()
    fireEvent.keyDown(notebook, { key: "ArrowLeft" })
    expect(notebooks).toHaveFocus()
    fireEvent.keyDown(notebooks, { key: "ArrowLeft" })
    expect(notebooks).toHaveAttribute("aria-expanded", "false")
    expect(notebooks).toHaveFocus()
    fireEvent.keyDown(notebooks, { key: "ArrowLeft" })
    expect(notebooks).toHaveFocus()
    fireEvent.keyDown(notebooks, { key: "End" })
    expect(lastRow).toHaveFocus()
    expect(scrollIntoView.mock.instances.at(-1)).toBe(lastRow)
    fireEvent.keyDown(lastRow, { key: "Home" })
    expect(examples).toHaveFocus()
    expect(mocks.editor.setActiveBuffer).not.toHaveBeenCalled()
  })

  it("enters the sorted List results from the filter and opens the focused tab", async () => {
    mocks.editor.buffers.push({ id: 3, label: "Unrelated", position: 2 })
    renderComponent(<TabsPanel open />)
    switchTo("List")
    await selectSort("Alphabetical (Z-A)")

    const filter = screen.getByRole("textbox", { name: "Filter tabs" })
    filter.focus()
    fireEvent.change(filter, { target: { value: "unknown" } })
    expect(fireEvent.keyDown(filter, { key: "ArrowDown" })).toBe(true)
    expect(filter).toHaveFocus()
    fireEvent.change(filter, { target: { value: "SQL" } })
    expect(fireEvent.keyDown(filter, { key: "Home" })).toBe(true)
    expect(filter).toHaveFocus()

    fireEvent.keyDown(filter, { key: "ArrowDown" })
    const first = screen.getByRole("treeitem", { name: "SQL 2" })
    const second = screen.getByRole("treeitem", { name: "SQL 1" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(second).toHaveFocus()
    fireEvent.keyDown(second, { key: "ArrowLeft" })
    const open = sectionHeader("tabs-panel-open")!
    expect(open).toHaveFocus()
    fireEvent.keyDown(open, { key: "ArrowRight" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    fireEvent.keyDown(second, { key: "ArrowRight" })
    const closed = sectionHeader("tabs-panel-closed")!
    expect(closed).toHaveFocus()
    fireEvent.keyDown(closed, { key: "ArrowLeft" })
    expect(closed).toHaveAttribute("aria-expanded", "true")
    expect(closed).toHaveFocus()
    fireEvent.keyDown(closed, { key: "ArrowUp" })
    expect(second).toHaveFocus()
    expect(mocks.editor.setActiveBuffer).not.toHaveBeenCalled()

    fireEvent.keyDown(second, { key: "Enter" })
    expect(mocks.editor.setActiveBuffer).toHaveBeenCalledOnce()
    expect(mocks.editor.setActiveBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    )
  })

  it.each([
    { section: "open", laterNotebook: "Open beta" },
    { section: "closed", laterNotebook: "Closed beta" },
  ])(
    "jumps from a later notebook directly to the $section heading",
    ({ section, laterNotebook }) => {
      mocks.editor.buffers = [
        {
          id: 1,
          label: "Open alpha",
          position: 0,
          notebookViewState: { cells: [] },
        },
        {
          id: 2,
          label: "Open beta",
          position: 1,
          notebookViewState: { cells: [] },
        },
        {
          id: 3,
          label: "Closed alpha",
          position: -1,
          archived: true,
          archivedAt: 200,
          notebookViewState: { cells: [] },
        },
        {
          id: 4,
          label: "Closed beta",
          position: -1,
          archived: true,
          archivedAt: 100,
          notebookViewState: { cells: [] },
        },
      ]
      renderComponent(<TabsPanel open />)
      switchTo("List")
      const notebook = screen.getByRole("treeitem", { name: laterNotebook })
      const heading = sectionHeader(`tabs-panel-${section}`)!

      notebook.focus()
      fireEvent.keyDown(notebook, { key: "ArrowLeft" })

      expect(heading).toHaveFocus()
      expect(heading).toHaveAttribute("aria-expanded", "true")
    },
  )

  it("pages to the visible edge and then advances by a viewport", () => {
    mocks.editor.buffers.push({ id: 3, label: "SQL 3", position: 2 })
    renderComponent(<TabsPanel open />)
    switchTo("List")

    const tree = screen.getByRole("tree", { name: "Tabs" })
    const open = sectionHeader("tabs-panel-open")!
    const first = screen.getByRole("treeitem", { name: "SQL 1" })
    const second = screen.getByRole("treeitem", { name: "SQL 2" })
    const third = screen.getByRole("treeitem", { name: "SQL 3" })
    const closed = sectionHeader("tabs-panel-closed")!
    const viewport = vi
      .spyOn(tree, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 150, 60))

    const surfaces = [
      open.querySelector('[data-hook="tabs-panel-section-toggle"]')!,
      first,
      second,
      third,
      closed.querySelector('[data-hook="tabs-panel-section-toggle"]')!,
    ]
    surfaces.forEach((surface, index) => {
      vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
        new DOMRect(0, index * 20, 150, 20),
      )
    })

    first.focus()
    fireEvent.keyDown(first, { key: "PageDown" })
    expect(second).toHaveFocus()
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "end",
      inline: "nearest",
    })
    fireEvent.keyDown(second, { key: "PageDown" })
    expect(closed).toHaveFocus()

    viewport.mockReturnValue(new DOMRect(0, 40, 150, 60))
    fireEvent.keyDown(closed, { key: "PageUp" })
    expect(second).toHaveFocus()
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "start",
      inline: "nearest",
    })
    fireEvent.keyDown(second, { key: "PageUp" })
    expect(open).toHaveFocus()
  })

  it("uses one Tab stop and keeps Alt+Arrow for Position reordering", async () => {
    const user = userEvent.setup()
    renderComponent(
      <>
        <TabsPanel open />
        <Button>After panel</Button>
      </>,
    )
    switchTo("List")
    await selectSort("Position")

    const first = screen.getByRole("treeitem", { name: "SQL 1" })
    const second = screen.getByRole("treeitem", { name: "SQL 2" })
    const close = within(first).getByRole("button", { name: "Close tab" })
    expect(close).toHaveAttribute("tabindex", "-1")
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab()
    expect(second).toHaveFocus()
    await user.tab({ shift: true })
    expect(first).toHaveFocus()
    const open = sectionHeader("tabs-panel-open")!
    await user.tab({ shift: true })
    expect(open).toHaveFocus()
    await user.tab({ shift: true })
    expect(getSort()).toHaveFocus()
    await user.tab()
    expect(open).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()

    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(second).toHaveFocus()
    expect(mocks.editor.reorderBuffer).not.toHaveBeenCalled()
    fireEvent.keyDown(second, { key: "ArrowUp", altKey: true })
    expect(second).toHaveFocus()
    expect(mocks.editor.reorderBuffer).toHaveBeenCalledWith(2, 0)
    fireEvent.keyDown(second, { key: "End" })
    expect(sectionHeader("tabs-panel-closed")).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "After panel" })).toHaveFocus()
  })

  it("opens row actions with Shift+F10 and restores focus when dismissed or used", async () => {
    renderComponent(<TabsPanel open />)
    switchTo("List")
    const first = screen.getByRole("treeitem", { name: "SQL 1" })
    const next = screen.getByRole("treeitem", { name: "SQL 2" })

    first.focus()
    fireEvent.keyDown(first, { key: "F10", shiftKey: true })
    const menu = await screen.findByRole("menu", { name: "SQL 1 actions" })
    expect(
      within(menu).getByRole("menuitem", { name: "Close tab" }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole("menuitem", { name: "Delete tab" }),
    ).toBeInTheDocument()
    fireEvent.keyDown(menu, { key: "Escape" })
    await waitFor(() => expect(first).toHaveFocus())
    expect(menu).not.toBeInTheDocument()

    fireEvent.keyDown(first, { key: "F10", shiftKey: true })
    const close = await screen.findByRole("menuitem", { name: "Close tab" })
    fireEvent.click(close)
    await waitFor(() => expect(next).toHaveFocus())
    expect(mocks.editor.closeBuffer).toHaveBeenCalledWith(1, { focus: false })
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
    toggleSection("tabs-panel-group-sql")
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
    toggleSection("tabs-panel-group-sql")
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
    toggleSection("tabs-panel-examples")
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
    toggleSection("tabs-panel-open")
    toggleSection("tabs-panel-closed")
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
