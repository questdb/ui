// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { focusPast } from "./focusPast"

const byId = (id: string) => document.getElementById(id) as HTMLElement

beforeEach(() => {
  document.body.innerHTML = `
    <button id="before">Before</button>
    <div id="guard">
      <textarea id="inside"></textarea>
      <button id="inside-button">Inside</button>
    </div>
    <button id="disabled-after" disabled>Disabled</button>
    <span id="not-tabbable" tabindex="-1">Skipped</span>
    <button id="after">After</button>
  `
})

describe("focusPast", () => {
  it("moves forward past the container when focus came from before it", () => {
    // Given focus moved into the container from the element before it
    byId("inside").focus()

    // When focus is sent past the container
    const moved = focusPast(byId("guard"), byId("before"))

    // Then the next focusable element after it takes focus
    expect(moved).toBe(true)
    expect(document.activeElement).toBe(byId("after"))
  })

  it("moves backward past the container when focus came from after it", () => {
    // Given focus moved into the container from the element after it
    byId("inside-button").focus()

    // When focus is sent past the container
    const moved = focusPast(byId("guard"), byId("after"))

    // Then the previous focusable element before it takes focus
    expect(moved).toBe(true)
    expect(document.activeElement).toBe(byId("before"))
  })

  it("reports when there is nothing to focus in that direction", () => {
    // Given nothing focusable follows the container
    byId("after").remove()
    byId("inside").focus()

    // When focus is sent forward past the container
    const moved = focusPast(byId("guard"), byId("before"))

    // Then it reports that focus did not move
    expect(moved).toBe(false)
  })
})
