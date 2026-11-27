// @vitest-environment jsdom
import React from "react"
import { render, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useEscapeLayer } from "./useEscapeLayer"
import { EscapePriority } from "../utils/escapeKey"

const Layer = ({
  enabled,
  onEscape,
}: {
  enabled: boolean
  onEscape: () => void
}) => {
  useEscapeLayer(enabled, {
    priority: EscapePriority.sidePanel,
    onEscape: () => {
      onEscape()
      return true
    },
  })
  return null
}

describe("useEscapeLayer", () => {
  it("registers only while enabled and calls the latest callback", () => {
    const first = vi.fn()
    const latest = vi.fn()
    const { rerender, unmount } = render(
      <Layer enabled={false} onEscape={first} />,
    )
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(first).not.toHaveBeenCalled()

    rerender(<Layer enabled onEscape={first} />)
    rerender(<Layer enabled onEscape={latest} />)
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)

    unmount()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(latest).toHaveBeenCalledTimes(1)
  })
})
