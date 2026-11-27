// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { getHook, renderComponent } from "../../../test/component"
import { SlashCommandMenu } from "./SlashCommandMenu"
import type { SlashCommand } from "./slashCommands"

it("fits the command list inside the chat panel and scrolls only the list for the active row", () => {
  const commands: SlashCommand[] = ["history", "compact"].map((name) => ({
    name,
    description: name,
    hint: null,
    source: "agent",
  }))
  let anchorTop = 180
  let onResize = () => {}
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        onResize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  // Provide deterministic bounds for the placement/scroll math, not jsdom layout.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.id === "panel") return new DOMRect(0, 100, 400, 200)
      if (this.id === "anchor") return new DOMRect(0, anchorTop, 400, 60)
      if (this.getAttribute("data-hook") === "chat-command-menu")
        return new DOMRect(0, 106, 400, 68)
      if (this.id === "command-0") return new DOMRect(0, 110, 400, 28)
      if (this.id === "command-1") return new DOMRect(0, 160, 400, 28)
      return new DOMRect()
    },
  )
  const view = (highlighted: number) => (
    <div id="panel" data-chat-panel="">
      <div id="anchor">
        <SlashCommandMenu
          id="command"
          commands={commands}
          highlighted={highlighted}
          onHighlight={vi.fn()}
          onChoose={vi.fn()}
        />
      </div>
    </div>
  )
  const { rerender } = renderComponent(view(0))
  const menu = getHook("chat-command-menu")
  expect(menu.style.getPropertyValue("--command-popup-room")).toBe("68px")
  expect(menu.style.getPropertyValue("--command-popup-bottom")).toBe("6px")
  vi.spyOn(menu, "clientHeight", "get").mockReturnValue(68)
  menu.scrollTop = 0
  rerender(view(1))
  expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
    "/compact",
  )
  expect(menu.scrollTop).toBe(14)
  expect(menu.parentElement?.scrollTop).toBe(0)

  anchorTop = 135
  onResize()
  expect(menu.style.getPropertyValue("--command-popup-top")).toBe("-29px")
  expect(menu.style.getPropertyValue("--command-popup-bottom")).toBe("auto")
  expect(menu.style.getPropertyValue("--command-popup-room")).toBe("188px")
})
