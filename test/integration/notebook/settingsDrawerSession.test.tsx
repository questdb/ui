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
import type { ChartConfig } from "../../../src/scenes/Editor/Notebook/CellChart/chartTypes"
import {
  resolveDraw,
  toChartResult,
} from "../../../src/scenes/Editor/Notebook/DrawCanvas/drawCanvasUtils"
import type { CellResult } from "../../../src/store/notebook"

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
  const choose = (control: string, value: string) => {
    fireEvent.keyDown(screen.getByRole("button", { name: control }), {
      key: "ArrowDown",
    })
    fireEvent.click(screen.getByRole("menuitemradio", { name: value }))
  }
  const save = () =>
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

  it("preserves disabled heatmap Rows through a temporary X collision", () => {
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
    choose("X-axis: bucket", "site")
    expect(
      screen.getByRole("button", { name: "Rows column: site" }),
    ).toBeVisible()
    choose("X-axis: site", "bucket")
    save()
    expect(onSave).toHaveBeenCalledWith(saved)
  })

  const statements = ["SELECT * FROM readings", "SELECT * FROM siblings"]
  const savedHeatmap: ChartConfig = {
    xColumn: "bucket",
    queries: [
      { type: "heatmap", partitionByColumn: "site", yColumns: ["reading"] },
      { type: "line", yColumns: ["total"], axis: "right" },
    ],
  }
  const results = (
    rows: (string | number)[][],
    removeColumn?: string,
  ): CellResult => ({
    timestamp: 0,
    activeResultIndex: 0,
    results: [
      {
        type: "dql",
        query: statements[0],
        count: rows.length,
        columns: [
          { name: "alt_bucket", type: "SYMBOL" },
          { name: "bucket", type: "SYMBOL" },
          { name: "site", type: "SYMBOL" },
          { name: "reading", type: "DOUBLE" },
        ].filter((col) => col.name !== removeColumn),
        dataset: rows,
      },
      {
        type: "dql",
        query: statements[1],
        count: 1,
        columns: [
          { name: "sibling_ts", type: "TIMESTAMP" },
          { name: "total", type: "DOUBLE" },
        ],
        dataset: [[1000, 20]],
      },
    ],
  })
  const heatmapRows = [["Z", "A", "west", 10]]
  const resolve = (result: CellResult, config = savedHeatmap) => {
    const frame = toChartResult(result, statements)
    if (frame.kind !== "settled") throw new Error("expected settled results")
    return {
      ...resolveDraw(statements, frame.results, config),
      emptyDqlResults: frame.emptyDqlResults,
    }
  }
  const drawer = (
    result: CellResult,
    onSave: (config: ChartConfig) => void,
    config = savedHeatmap,
  ) => {
    const { tabs, effectiveConfig, emptyDqlResults } = resolve(result, config)
    return (
      <ChartSettingsDrawer
        open
        appearInPlace
        config={effectiveConfig}
        tabs={tabs}
        emptyDqlResults={emptyDqlResults}
        initialDraft={null}
        onDraftChange={noOp}
        onClose={noOp}
        onSave={onSave}
      />
    )
  }

  it.each([false, true])(
    "keeps authored X on an unrelated Save with an empty heatmap (already open: %s)",
    (alreadyOpen) => {
      const onSave = vi.fn<[ChartConfig], void>()
      const empty = results([])
      const view = renderComponent(
        drawer(alreadyOpen ? results(heatmapRows) : empty, onSave),
      )
      if (alreadyOpen) view.rerender(drawer(empty, onSave))
      expect(
        screen.getByRole("button", { name: "X-axis: sibling_ts" }),
      ).toBeVisible()
      fireEvent.change(screen.getByPlaceholderText("Name (e.g. RSI)"), {
        target: { value: "Total" },
      })
      save()
      expect(onSave).toHaveBeenCalledWith({
        ...savedHeatmap,
        rightAxis: { name: "Total" },
      })
      const committed = onSave.mock.calls[0][0]
      expect(resolve(results(heatmapRows), committed).chart.xColumn).toBe(
        "bucket",
      )
    },
  )

  it("does not persist a replacement anchor's X on inclusion-only Save", () => {
    const onSave = vi.fn<[ChartConfig], void>()
    const result = results(heatmapRows)
    const view = renderComponent(drawer(result, onSave))
    const include = () =>
      screen.getByRole("checkbox", { name: "Include in chart" })
    fireEvent.click(include())
    expect(
      screen.getByRole("button", { name: "X-axis: sibling_ts" }),
    ).toBeVisible()
    save()
    const excluded = onSave.mock.calls[0][0]
    expect(excluded.xColumn).toBe("bucket")
    expect(excluded.queries[0]?.enabled).toBe(false)
    view.unmount()
    renderComponent(drawer(result, onSave, excluded))
    fireEvent.click(include())
    save()
    expect(onSave).toHaveBeenLastCalledWith(savedHeatmap)
  })

  it.each([
    { remove: "site", rows: [["Z", "A", 10]], hasTab: true },
    { remove: "bucket", rows: [["Z", "west", 10]], hasTab: true },
    { remove: "reading", rows: [], hasTab: false },
  ])(
    "rejects an open draft when current DQL loses $remove",
    ({ remove, rows, hasTab }) => {
      const onSave = vi.fn()
      const view = renderComponent(drawer(results(heatmapRows), onSave))
      view.rerender(drawer(results(rows, remove), onSave))
      save()
      expect(onSave).not.toHaveBeenCalled()
      if (hasTab) {
        expect(screen.getByText(/Pick a separate rows column/)).toBeVisible()
      } else {
        expect(screen.getByRole("alert")).toHaveTextContent(
          /a numeric value column/,
        )
      }
      view.rerender(drawer(results(heatmapRows), onSave))
      save()
      expect(onSave).toHaveBeenCalledWith(savedHeatmap)
    },
  )

  it("offers and saves a heatmap with numeric X, categorical Rows and numeric Value", () => {
    const onSave = vi.fn()
    const statement = "SELECT slot, site, reading FROM samples"
    const { effectiveConfig, tabs } = resolveDraw(
      [statement],
      [
        {
          query: statement,
          type: "dql",
          count: 1,
          columns: [
            { name: "slot", type: "INT" },
            { name: "site", type: "SYMBOL" },
            { name: "reading", type: "DOUBLE" },
          ],
          dataset: [[2, "west", 10]],
        },
      ],
      { xColumn: null, queries: [{ type: "bar", yColumns: ["reading"] }] },
    )
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
    choose("X-axis: site", "slot")
    choose("Chart type: Bar", "Heatmap")
    expect(
      screen.getByRole("button", { name: "Rows column: site" }),
    ).toBeVisible()
    save()
    expect(onSave).toHaveBeenCalledWith({
      xColumn: "slot",
      queries: [
        { type: "heatmap", partitionByColumn: "site", yColumns: ["reading"] },
      ],
    })
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
