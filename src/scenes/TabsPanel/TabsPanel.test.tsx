// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"

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

const switchTo = (mode: "groups" | "list") =>
  fireEvent.click(
    document.querySelector(`[data-hook="tabs-panel-view-${mode}"]`)!,
  )

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
    switchTo("list")

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
    switchTo("list")
    fireEvent.click(sectionHeader("tabs-panel-open")!)

    // When the user switches back to Groups view
    switchTo("groups")

    // Then the Example dashboards section is expanded
    expect(
      sectionHeader("tabs-panel-examples")?.getAttribute("aria-expanded"),
    ).toBe("true")
  })
})

describe("TabsPanel active tab reveal", () => {
  const expectRevealed = (section: string, rowSelector: string) => {
    expect(sectionHeader(section)).toHaveAttribute("aria-expanded", "true")
    const row = document.querySelector(rowSelector)
    expect(row).not.toBeNull()
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "center",
      inline: "nearest",
    })
    expect(scrollIntoView.mock.instances.at(-1)).toBe(row)
  }

  it("centers the active row after opening its group and preserves keyboard focus", () => {
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
    switchTo("list")
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
    switchTo("list")
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
