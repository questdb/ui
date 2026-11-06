// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../../../../components/Button"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import { HighlightSettingsDrawer } from "./HighlightSettingsDrawer"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "../settingsDrawer/CellOverlayContext"

const configuration: HighlightConfig = {
  identityColumns: ["k"],
  rules: [
    {
      id: "change",
      kind: "previous",
      enabled: true,
      target: { kind: "column", name: "v" },
      condition: { op: "changedBy", threshold: 0, unit: "percent" },
      appliesTo: "cell",
      display: "temporary",
      color: "dataSeries2",
    },
  ],
}
const Fixture = ({
  onSave,
  onClear,
}: {
  onSave: (config: HighlightConfig) => void
  onClear: () => void
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Highlight rules</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          open={open}
          appearInPlace
          initialDraft={{ config: configuration, expandedRuleId: "change" }}
          onDraftChange={() => undefined}
          columns={[
            { name: "k", type: "STRING" },
            { name: "v", type: "LONG" },
          ]}
          columnRange={() => null}
          config={configuration}
          duplicateCountOf={() => 0}
          onSave={onSave}
          onClear={onClear}
          onCancel={() => setOpen(false)}
        />
      </CellOverlayProvider>
    </>
  )
}

describe("highlight settings validation", () => {
  it("keeps invalid thresholds editable and only submits a valid correction", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(<Fixture onSave={onSave} onClear={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Highlight rules" }))
    const input = await screen.findByLabelText("Change threshold")
    // When / Then
    fireEvent.change(input, { target: { value: "-5" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Should be non-negative")).toBeVisible()
    expect(input).toHaveValue(-5)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Should be a number")).toBeVisible()
    expect(input).toHaveValue(null)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      ...configuration,
      rules: [
        {
          ...configuration.rules[0],
          condition: { op: "changedBy", threshold: 2, unit: "percent" },
        },
      ],
    })
  })

  it("clears saved rules without submitting the edited draft", async () => {
    // Given
    const onSave = vi.fn()
    const onClear = vi.fn()
    renderComponent(<Fixture onSave={onSave} onClear={onClear} />)
    fireEvent.click(screen.getByRole("button", { name: "Highlight rules" }))
    const input = await screen.findByLabelText("Change threshold")
    fireEvent.change(input, { target: { value: "99" } })
    // When
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    // Then
    expect(onClear).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
