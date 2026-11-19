// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../../../../components/Button"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import {
  HighlightSettingsDrawer,
  type GridSettingsSave,
} from "./HighlightSettingsDrawer"
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
  saved = configuration,
  focus,
  gridMode,
}: {
  onSave: (next: GridSettingsSave) => void
  saved?: HighlightConfig
  focus?: { section: string; column?: string }
  gridMode?: "stable" | "stream"
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Grid settings</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          open={open}
          appearInPlace
          initialDraft={
            saved === configuration
              ? {
                  config: configuration,
                  expandedRuleId: "change",
                  formats: { v: { decimals: 1 } },
                }
              : null
          }
          onDraftChange={() => undefined}
          columns={[
            { name: "k", type: "STRING" },
            { name: "v", type: "LONG" },
          ]}
          columnRange={() => null}
          config={saved}
          formats={{ v: { decimals: 1 } }}
          gridMode={gridMode}
          samples={{ v: 12 }}
          focus={focus}
          defaultIdentity={["k"]}
          duplicateCountOf={() => 0}
          onSave={onSave}
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
    renderComponent(<Fixture onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
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
      highlight: {
        ...configuration,
        rules: [
          {
            ...configuration.rules[0],
            condition: { op: "changedBy", threshold: 2, unit: "percent" },
          },
        ],
      },
      formats: { v: { decimals: 1 } },
    })
  })

  it("clears the rules without submitting the edited rules", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(<Fixture onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const input = await screen.findByLabelText("Change threshold")
    fireEvent.change(input, { target: { value: "99" } })
    // When
    fireEvent.click(screen.getByRole("button", { name: "Clear rules" }))
    // Then
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith({
      highlight: null,
      formats: { v: { decimals: 1 } },
    })
  })

  it("keeps a chosen identity when the rules are cleared", async () => {
    // Given rules matched by a non-default identity
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ ...configuration, identityColumns: ["v"] }}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When
    fireEvent.click(await screen.findByRole("button", { name: "Clear rules" }))

    // Then
    expect(onSave).toHaveBeenCalledWith({
      highlight: { identityColumns: ["v"], rules: [] },
      formats: { v: { decimals: 1 } },
    })
  })

  it("opens on the column a header asked for and saves no highlight settings for a formats-only change", async () => {
    // Given a grid without highlight settings
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ identityColumns: ["k"], rules: [] }}
        focus={{ section: "formats", column: "v" }}
        onSave={onSave}
      />,
    )

    // When the drawer opens from the header and the user saves
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    expect(
      await screen.findByRole("button", { name: /^v: show as/ }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then only the formats are saved
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      highlight: null,
      formats: { v: { decimals: 1 } },
    })
  })

  it("saves the live update mode the user picks, and warns while no columns match rows", async () => {
    // Given a grid with no identity columns
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ identityColumns: [], rules: [] }} onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When the user keeps rows in place
    await userEvent.click(
      await screen.findByRole("button", { name: /^Live updates:/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /^Keep rows in place/ }),
    )

    // Then it explains the mode, warns about the missing columns and saves it
    expect(screen.getByText(/A row stays where it was/)).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      /Choose the columns that match rows/,
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0]).toEqual([
      {
        highlight: { identityColumns: [], rules: [] },
        formats: { v: { decimals: 1 } },
        gridMode: "stable",
      },
    ])
  })

  it("turns a live mode off", async () => {
    // Given a grid that keeps rows in place
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ identityColumns: ["k"], rules: [] }}
        gridMode="stable"
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When the user goes back to the query's order
    await userEvent.click(
      await screen.findByRole("button", { name: /^Live updates:/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", {
        name: /^Rows as the query returns them/,
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then the mode is saved as unset, so the cell drops it
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saved = (onSave.mock.calls[0] as [GridSettingsSave])[0]
    expect("gridMode" in saved).toBe(true)
    expect(saved.gridMode).toBeUndefined()
  })
})
