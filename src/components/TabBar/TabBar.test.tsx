// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import { TabBar } from "./TabBar"

// jsdom has no layout: every tab gets the minimum width, so slot i starts
// at i * 150px.
const TAB_WIDTH = 150
const slotCenter = (index: number) => index * TAB_WIDTH + TAB_WIDTH / 2

const pointer = (type: string, clientX: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
  })
  Object.defineProperty(event, "pointerId", { value: 1 })
  return event
}

const onTabReorder = vi.fn()
let closeFirstTab: () => void = () => undefined

const Bar = () => {
  const [ids, setIds] = useState(["1", "2", "3", "4"])
  closeFirstTab = () => setIds((current) => current.slice(1))
  return (
    <TabBar
      tabs={ids.map((id) => ({ id, title: `Tab ${id}`, active: id === "3" }))}
      onTabActive={() => undefined}
      onTabClose={() => undefined}
      onTabRename={() => undefined}
      onNewTab={() => undefined}
      onTabReorder={onTabReorder}
    />
  )
}

const displayedIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".chrome-tab")).map((tab) =>
    tab.getAttribute("data-tab-id"),
  )

const pressOnTab = (container: HTMLElement, id: string, clientX: number) => {
  const handle = container.querySelector(
    `.chrome-tab[data-tab-id="${id}"] .chrome-tab-drag-handle`,
  ) as HTMLElement
  act(() => {
    handle.dispatchEvent(pointer("pointerdown", clientX))
  })
}

const movePointer = (clientX: number) =>
  act(() => {
    document.dispatchEvent(pointer("pointermove", clientX))
  })

const releasePointer = (clientX: number) =>
  act(() => {
    document.dispatchEvent(pointer("pointerup", clientX))
  })

beforeEach(() => {
  onTabReorder.mockReset()
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => undefined)
})

describe("TabBar drag", () => {
  it("moves the dragged tab to the drop slot", () => {
    // Given four tabs
    const { container } = renderComponent(<Bar />)

    // When tab 3 is dragged onto the first slot
    pressOnTab(container, "3", slotCenter(2))
    movePointer(slotCenter(2) - 10)
    movePointer(slotCenter(0))
    releasePointer(slotCenter(0))

    // Then tab 3 is reordered there and shown first
    expect(onTabReorder).toHaveBeenCalledWith("3", 2, 0)
    expect(displayedIds(container)).toEqual(["3", "1", "2", "4"])
  })

  it("cancels the drag when a tab before the dragged one goes away", () => {
    // Given tab 3 is being dragged
    const { container } = renderComponent(<Bar />)
    pressOnTab(container, "3", slotCenter(2))
    movePointer(slotCenter(2) - 10)

    // When tab 1 is closed meanwhile (e.g. by an agent) and the pointer is
    // released on the first slot
    act(() => closeFirstTab())
    movePointer(slotCenter(0))
    releasePointer(slotCenter(0))

    // Then nothing is reordered and the bar shows the remaining tabs as given
    expect(onTabReorder).not.toHaveBeenCalled()
    expect(displayedIds(container)).toEqual(["2", "3", "4"])
    expect(container.querySelector(".chrome-tab-is-dragging")).toBeNull()
  })
})

describe("TabBar rename", () => {
  const renameInput = (container: HTMLElement, id: string) =>
    container.querySelector(
      `.chrome-tab[data-tab-id="${id}"] .chrome-tab-rename`,
    ) as HTMLInputElement

  const expectWholeTitleSelected = (input: HTMLInputElement) => {
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  }

  // Animation frames never run here (see beforeEach), as on a machine that
  // has not painted yet when the user starts typing.
  it("selects the title as soon as a double-click starts renaming", () => {
    // Given a tab bar
    const { container } = renderComponent(<Bar />)

    // When the user double-clicks a tab
    fireEvent.doubleClick(
      container.querySelector(
        '.chrome-tab[data-tab-id="2"] .chrome-tab-drag-handle',
      ) as HTMLElement,
    )

    // Then its whole title is selected, so typing replaces it
    const input = renameInput(container, "2")
    expect(input.value).toBe("Tab 2")
    expectWholeTitleSelected(input)
  })

  it("selects the title as soon as the edit button starts renaming", () => {
    // Given a tab bar
    const { container } = renderComponent(<Bar />)

    // When the user clicks a tab's edit button
    fireEvent.click(
      container.querySelector(
        '.chrome-tab[data-tab-id="3"] .chrome-tab-edit',
      ) as HTMLElement,
    )

    // Then its whole title is selected
    expectWholeTitleSelected(renameInput(container, "3"))
  })
})
