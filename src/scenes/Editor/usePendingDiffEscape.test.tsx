// @vitest-environment jsdom
import React from "react"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { usePendingDiffEscape } from "./usePendingDiffEscape"
import { useEscapeLayer } from "../../hooks/useEscapeLayer"
import { EscapePriority } from "../../utils/escapeKey"

// The AI chat drawer around its input: a side panel layer scoped to it.
const Workspace = ({
  pending,
  onReject,
  onClosePanel,
  draft,
}: {
  pending: boolean
  onReject: () => void
  onClosePanel: () => void
  draft: string
}) => {
  const panel = React.useRef<HTMLDivElement>(null)
  usePendingDiffEscape(pending, onReject)
  useEscapeLayer(true, {
    priority: EscapePriority.sidePanel,
    scope: () => panel.current,
    onEscape: () => {
      onClosePanel()
      return true
    },
  })
  return (
    <div ref={panel}>
      <textarea aria-label="chat" defaultValue={draft} />
    </div>
  )
}

const setup = (draft: string, pending = true) => {
  const onReject = vi.fn()
  const onClosePanel = vi.fn()
  const view = render(
    <Workspace
      pending={pending}
      onReject={onReject}
      onClosePanel={onClosePanel}
      draft={draft}
    />,
  )
  fireEvent.keyDown(view.getByLabelText("chat"), { key: "Escape" })
  return { onReject, onClosePanel }
}

describe("Escape with a pending AI suggestion", () => {
  it("rejects the diff from a chat input holding a draft", () => {
    const { onReject, onClosePanel } = setup("draft follow-up")
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onClosePanel).not.toHaveBeenCalled()
  })

  it("rejects the diff before the chat panel around the focus closes", () => {
    const { onReject, onClosePanel } = setup("")
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onClosePanel).not.toHaveBeenCalled()
  })

  it("leaves Escape to the panel when no diff is pending", () => {
    const { onReject, onClosePanel } = setup("", false)
    expect(onReject).not.toHaveBeenCalled()
    expect(onClosePanel).toHaveBeenCalledTimes(1)
  })
})
