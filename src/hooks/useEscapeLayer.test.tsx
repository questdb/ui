// @vitest-environment jsdom
import React from "react"
import { render, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useEscapeLayer } from "./useEscapeLayer"
import { EscapePriority } from "../utils/escapeKey"

const PendingDiff = ({ onReject }: { onReject: () => void }) => {
  useEscapeLayer(true, {
    priority: EscapePriority.editorDiff,
    global: true,
    onEscape: () => {
      onReject()
      return true
    },
  })
  return <textarea defaultValue="draft follow-up" aria-label="chat" />
}

describe("useEscapeLayer", () => {
  // The AI chat input does not act on Escape, so a pending diff answers it.
  it("registers a global layer that answers from a text field with text", () => {
    const onReject = vi.fn()
    const { getByLabelText } = render(<PendingDiff onReject={onReject} />)
    fireEvent.keyDown(getByLabelText("chat"), { key: "Escape" })
    expect(onReject).toHaveBeenCalledTimes(1)
  })
})
