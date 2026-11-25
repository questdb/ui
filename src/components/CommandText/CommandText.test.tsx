// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import { CommandText, commandSegmentsOf } from "./index"

describe("commandSegmentsOf", () => {
  it("splits a command into what runs it, what it does, and each option", () => {
    // When
    const segments = commandSegmentsOf(
      "npx @questdb/mcp-server-questdb@0.6.0 connect http://localhost:9000 --agent codex --no-open",
    )

    // Then
    expect(segments).toEqual([
      [
        { text: "npx", role: "launcher" },
        { text: "@questdb/mcp-server-questdb@0.6.0", role: "package" },
      ],
      [
        { text: "connect", role: "subcommand" },
        { text: "http://localhost:9000", role: "argument" },
      ],
      [
        { text: "--agent", role: "flag" },
        { text: "codex", role: "value" },
      ],
      [{ text: "--no-open", role: "flag" }],
    ])
  })
})

describe("CommandText", () => {
  it("copies a selection as the plain one-line command", () => {
    // Given
    const command =
      "npx @questdb/mcp-server-questdb@0.6.0 connect http://localhost:9000 --agent codex"
    const { container } = renderComponent(<CommandText command={command} />)
    const root = container.querySelector("[data-command]") as HTMLElement
    const selection = window.getSelection()
    selection?.selectAllChildren(root)
    const setData = vi.fn()

    // When
    fireEvent.copy(root, { clipboardData: { setData } })

    // Then
    expect(setData).toHaveBeenCalledWith("text/plain", command)
  })
})
