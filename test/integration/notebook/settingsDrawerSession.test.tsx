// @vitest-environment jsdom
import {
  renderComponent,
  getHook,
  queryHook,
} from "../../../src/test/component"
import React, { useState } from "react"
import { act, fireEvent, screen, within } from "@testing-library/react"
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
import { ChartSettingsDrawer } from "../../../src/scenes/Editor/Notebook/CellChart/ChartSettingsDrawer"
import { resolveDraw } from "../../../src/scenes/Editor/Notebook/DrawCanvas/drawCanvasUtils"

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

describe("chart drawer", () => {
  it("preserves the disabled heatmap Rows mapping on an unedited Save", () => {
    const query = "SELECT site, bucket, reading FROM samples"
    const saved = {
      xColumn: "bucket",
      queries: [
        {
          type: "heatmap" as const,
          enabled: false,
          partitionByColumn: "site",
          yColumns: ["reading"],
        },
      ],
    }
    const { tabs, effectiveConfig, renderQueries } = resolveDraw(
      [query],
      [
        {
          query,
          type: "dql",
          columns: [
            { name: "site", type: "SYMBOL" },
            { name: "bucket", type: "SYMBOL" },
            { name: "reading", type: "DOUBLE" },
          ],
          dataset: [["west", "A", 15]],
          count: 1,
        },
      ],
      saved,
    )
    expect(renderQueries).toEqual([])
    const onSave = vi.fn()
    renderComponent(
      <ChartSettingsDrawer
        open
        appearInPlace
        config={effectiveConfig}
        tabs={tabs}
        initialDraft={null}
        onDraftChange={noOp}
        onClose={noOp}
        onSave={onSave}
      />,
    )
    expect(screen.getByRole("button", { name: "X-axis: bucket" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Rows column: site" }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(saved)
  })

  it.each([false, true])(
    "rejects a Rows/X collision after re-anchoring (initially excluded: %s)",
    (excluded) => {
      const statements = [
        "SELECT site, reading FROM samples",
        "SELECT bucket, site, reading FROM samples",
      ]
      const heatmap = {
        type: "heatmap" as const,
        enabled: !excluded,
        partitionByColumn: "site",
        yColumns: ["reading"],
      }
      const site = { name: "site", type: "SYMBOL" }
      const reading = { name: "reading", type: "DOUBLE" }
      const { tabs, effectiveConfig } = resolveDraw(
        statements,
        [
          {
            type: "dql",
            query: statements[0],
            count: 1,
            columns: [site, reading],
            dataset: [["west", 10]],
          },
          {
            type: "dql",
            query: statements[1],
            count: 1,
            columns: [{ name: "bucket", type: "SYMBOL" }, site, reading],
            dataset: [["A", "west", 20]],
          },
        ],
        {
          xColumn: "site",
          queries: [{ type: "line", yColumns: ["reading"] }, heatmap],
        },
      )
      const onSave = vi.fn()
      const onClose = vi.fn()
      renderComponent(
        <ChartSettingsDrawer
          open
          appearInPlace
          config={effectiveConfig}
          tabs={tabs}
          initialDraft={null}
          onDraftChange={noOp}
          onClose={onClose}
          onSave={onSave}
        />,
      )
      const include = () =>
        screen.getByRole("checkbox", { name: "Include in chart" })
      const save = () =>
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
      fireEvent.click(include())
      fireEvent.click(screen.getByRole("tab", { name: "Q2" }))
      if (excluded) fireEvent.click(include())
      expect(screen.getByRole("button", { name: "X-axis: site" })).toBeVisible()
      save()
      expect(onSave).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(
        screen.getByText(
          "Pick a separate rows column and a numeric value column",
        ),
      ).toBeVisible()

      fireEvent.click(include())
      save()
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          xColumn: "site",
          queries: [
            expect.objectContaining({ enabled: false }),
            { ...heatmap, enabled: false },
          ],
        }),
      )
    },
  )

  it("lets an incompatible query become the anchor and edit its X-axis and reference lines", () => {
    const queries = [
      "SELECT bucket, site, price FROM a",
      "SELECT ts, price FROM b",
    ]
    const resolution = resolveDraw(
      queries,
      [
        {
          type: "dql",
          query: queries[0],
          count: 1,
          columns: [
            { name: "bucket", type: "SYMBOL" },
            { name: "site", type: "SYMBOL" },
            { name: "price", type: "DOUBLE" },
          ],
          dataset: [["A", "west", 10]],
        },
        {
          type: "dql",
          query: queries[1],
          count: 1,
          columns: [
            { name: "ts", type: "TIMESTAMP" },
            { name: "sample_time", type: "TIMESTAMP" },
            { name: "price", type: "DOUBLE" },
          ],
          dataset: [[1000, 1100, 20]],
        },
      ],
      {
        xColumn: "bucket",
        queries: [
          { type: "heatmap", partitionByColumn: "site", yColumns: ["price"] },
          { type: "line", enabled: false, yColumns: ["price"] },
        ],
        referenceLines: [{ value: 15 }],
      },
    )
    const onSave = vi.fn()
    renderComponent(
      <ChartSettingsDrawer
        open
        appearInPlace
        config={resolution.effectiveConfig}
        tabs={resolution.tabs}
        initialDraft={null}
        onDraftChange={noOp}
        onClose={noOp}
        onSave={onSave}
      />,
    )
    const drawer = within(
      screen.getByRole("dialog", { name: "Chart settings" }),
    )
    const include = () =>
      drawer.getByRole("checkbox", { name: "Include in chart" })
    expect(drawer.queryByLabelText("Line 1 value")).not.toBeInTheDocument()
    fireEvent.click(include())
    fireEvent.click(drawer.getByRole("tab", { name: "Q2" }))
    expect(include()).not.toBeChecked()
    const x = drawer.getByRole("button", { name: "X-axis: ts" })
    fireEvent.keyDown(x, { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: "sample_time" }))
    fireEvent.click(include())
    expect(drawer.queryByText(/different x-axis kind/)).not.toBeInTheDocument()
    expect(drawer.getByLabelText("Line 1 value")).toHaveValue(15)
    fireEvent.click(drawer.getByRole("tab", { name: "Q1" }))
    expect(drawer.getByLabelText("Line 1 value")).toHaveValue(15)
    fireEvent.click(drawer.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        xColumn: "sample_time",
        queries: [
          expect.objectContaining({ type: "heatmap", enabled: false }),
          expect.objectContaining({ type: "line", enabled: undefined }),
        ],
        referenceLines: [{ value: 15 }],
      }),
    )
  })
})
