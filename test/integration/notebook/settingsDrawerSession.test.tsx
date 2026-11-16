// @vitest-environment jsdom
import {
  renderComponent,
  getHook,
  queryHook,
} from "../../../src/test/component"
import React, { useState } from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Button } from "../../../src/components/Button"
import { toast } from "../../../src/components/Toast"
import { eventBus } from "../../../src/modules/EventBus"
import { EventType } from "../../../src/modules/EventBus/types"
import type { HighlightConfig } from "../../../src/components/ResultGrid/highlight"
import { HighlightSettingsDrawer } from "../../../src/scenes/Editor/Notebook/CellHighlight/HighlightSettingsDrawer"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "../../../src/scenes/Editor/Notebook/settingsDrawer/CellOverlayContext"
import { useSettingsDrawerSession } from "../../../src/scenes/Editor/Notebook/settingsDrawer/useSettingsDrawerSession"
import { highlightSettingsSessions } from "../../../src/scenes/Editor/Notebook/settingsDrawer/settingsDrawerSessions"

const cellId = "review-cell"
const noOp = () => undefined
const config = (threshold: number): HighlightConfig => ({
  identityColumns: ["k"],
  rules: [
    {
      id: "rule",
      kind: "value",
      enabled: true,
      target: { kind: "column", name: "v" },
      condition: { op: "gt", value: threshold },
      appliesTo: "cell",
      display: "always",
      color: "dataSeries2",
    },
  ],
})
const requestOpen = () =>
  eventBus.publish(EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS, {
    cellId,
    mode: "open",
  })
const Fixture = ({ saved }: { saved: HighlightConfig }) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const session = useSettingsDrawerSession({
    sessions: highlightSettingsSessions,
    cellId,
    config: saved,
    openEvent: EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS,
    onOpen: noOp,
    onCancel: noOp,
    changedWhileOpenMessage: "Rules changed externally",
  })
  return (
    <>
      <Button onClick={requestOpen}>Open highlight rules</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          key={session.generation}
          open={session.open}
          appearInPlace
          initialDraft={session.initialDraft}
          onDraftChange={session.keepDraft}
          columns={[
            { name: "k", type: "STRING" },
            { name: "v", type: "LONG" },
          ]}
          columnRange={() => null}
          config={saved}
          duplicateCountOf={() => 0}
          onSave={noOp}
          onClear={noOp}
          onCancel={session.cancel}
        />
      </CellOverlayProvider>
    </>
  )
}
const editRule = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Edit rule/ }))
beforeEach(() => {
  highlightSettingsSessions.clear(cellId)
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  )
})

describe("highlight drawer session integration", () => {
  it("keeps the edited draft when another open request targets the same drawer", () => {
    // Given
    renderComponent(<Fixture saved={config(1)} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Open highlight rules" }),
    )
    editRule()
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "3" } })
    // When
    act(() => requestOpen())
    // Then
    expect(getHook("highlight-settings-drawer")).toBeVisible()
    expect(screen.getByLabelText("Value")).toHaveValue(3)
    expect(screen.getByRole("button", { name: "Column" })).toHaveTextContent(
      "v",
    )
    expect(
      screen.getByRole("button", { name: /^Condition/ }),
    ).toHaveTextContent("> value")
  })

  it("discards an open draft when saved rules change and reopens the new rules", () => {
    // Given
    const notification = vi.spyOn(toast, "info")
    const view = renderComponent(<Fixture saved={config(1)} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Open highlight rules" }),
    )
    editRule()
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "999" },
    })
    // When
    view.rerender(<Fixture saved={config(100)} />)
    // Then
    expect(queryHook("highlight-settings-drawer")).not.toBeInTheDocument()
    expect(notification).toHaveBeenCalledWith("Rules changed externally")
    fireEvent.click(
      screen.getByRole("button", { name: "Open highlight rules" }),
    )
    editRule()
    expect(screen.getByLabelText("Value")).toHaveValue(100)
  })
})
