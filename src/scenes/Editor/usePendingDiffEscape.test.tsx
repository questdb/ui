// @vitest-environment jsdom
import React from "react"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { usePendingDiffEscape } from "./usePendingDiffEscape"
import { useEscapeLayer } from "../../hooks/useEscapeLayer"
import { EscapePriority } from "../../utils/escapeKey"

// The diff editor (Monaco prevents the default of every Escape it gets) next
// to the AI chat panel, a side panel layer scoped to its own element.
const Workspace = ({
  pending,
  onReject,
  onClosePanel,
}: {
  pending: boolean
  onReject: () => void
  onClosePanel: () => void
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
    <>
      <div className="monaco-editor">
        <textarea
          aria-label="diff"
          onKeyDown={(event) => event.preventDefault()}
        />
      </div>
      <div ref={panel}>
        <input aria-label="chat" />
      </div>
    </>
  )
}

const press = (label: string, pending = true) => {
  const onReject = vi.fn()
  const onClosePanel = vi.fn()
  const view = render(
    <Workspace
      pending={pending}
      onReject={onReject}
      onClosePanel={onClosePanel}
    />,
  )
  fireEvent.keyDown(view.getByLabelText(label), { key: "Escape" })
  return { onReject, onClosePanel }
}

describe("Escape with a pending AI suggestion", () => {
  it("rejects the suggestion from the diff editor, before the side panel closes", () => {
    const { onReject, onClosePanel } = press("diff")
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onClosePanel).not.toHaveBeenCalled()
  })

  it("closes the side panel the focus is in", () => {
    const { onReject, onClosePanel } = press("chat")
    expect(onReject).not.toHaveBeenCalled()
    expect(onClosePanel).toHaveBeenCalledTimes(1)
  })

  it("leaves Escape to the panel when no suggestion is pending", () => {
    const { onReject, onClosePanel } = press("diff", false)
    expect(onReject).not.toHaveBeenCalled()
    expect(onClosePanel).toHaveBeenCalledTimes(1)
  })
})
