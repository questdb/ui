// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

beforeEach(() => {
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
