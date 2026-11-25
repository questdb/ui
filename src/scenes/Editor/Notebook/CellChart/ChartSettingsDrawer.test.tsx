// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { hasRightAxisLineWithoutQuery } from "../../../../utils/tools/chartConfigWire"
import { resolveDraw } from "../DrawCanvas/drawCanvasUtils"
import { buildEchartsOption } from "./buildEchartsOption"
import { ChartSettingsPanel } from "./ChartSettingsDrawer"
import type { ChartConfig, ReferenceLine, SeriesAxis } from "./chartTypes"

const statements = ["SELECT ts, price FROM t", "SELECT ts, rsi FROM t"]

const result = (index: number, rows: number): QueryExecResult => {
  const y = index === 0 ? "price" : "rsi"
  const dataset = Array.from({ length: rows }, (_, i) => [
    `2024-01-0${i + 1}T00:00:00.000000Z`,
    index === 0 ? 100 + i : 40 + i,
  ])
  return {
    type: "dql",
    query: statements[index],
    columns: [
      { name: "ts", type: "TIMESTAMP" },
      { name: y, type: "DOUBLE" },
    ],
    dataset,
    count: dataset.length,
  }
}

type Placement = { axis: SeriesAxis; enabled?: boolean; rows?: number }

// Price is Q1 and RSI is Q2, each with its row count; a query with no rows is
// left out of the results, as a query that returned nothing is.
const resolve = (config: ChartConfig, rows: [number, number] = [2, 2]) =>
  resolveDraw(
    statements,
    rows.flatMap((count, index) =>
      count > 0 ? [{ ...result(index, count), statementIndex: index }] : [],
    ),
    config,
  )

const chartConfig = (
  [price, rsi]: [Placement, Placement],
  referenceLines: ReferenceLine[],
): ChartConfig => ({
  xColumn: "ts",
  queries: [
    { type: "line", yColumns: ["price"], axis: price.axis },
    {
      type: "line",
      yColumns: ["rsi"],
      axis: rsi.axis,
      ...(rsi.enabled === false && { enabled: false }),
    },
  ],
  referenceLines,
})

// The axis index each drawn reference line value lands on.
const drawnLines = (resolution: ReturnType<typeof resolveDraw>) =>
  (
    buildEchartsOption(resolution.chart, resolution.renderQueries)
      .series as Record<string, unknown>[]
  )
    .filter(
      (s) => typeof s.id === "string" && s.id.startsWith("reference-lines"),
    )
    .flatMap((s) =>
      (s.markLine as { data: { yAxis: number }[] }).data.map((d) => ({
        value: d.yAxis,
        axis: s.yAxisIndex,
      })),
    )

const renderPanel = (config: ChartConfig, resolution = resolve(config)) => {
  const onSave = vi.fn<[ChartConfig], void>()
  const onSaveBlocked = vi.fn()
  renderComponent(
    <ChartSettingsPanel
      tabs={resolution.tabs}
      config={resolution.effectiveConfig}
      onSave={onSave}
      telemetry={{ onSaveBlocked }}
    />,
  )
  return { onSave, onSaveBlocked }
}

const choose = async (select: string, option: string) => {
  await userEvent.click(screen.getByRole("button", { name: select }))
  await userEvent.click(screen.getByRole("menuitemradio", { name: option }))
}

describe("ChartSettingsPanel — reference lines", () => {
  it("keeps a right-axis line movable and refuses to apply it once its query moves left", async () => {
    // Given price on the left, RSI on the right, and an overbought line on RSI
    const overbought = {
      value: 70,
      axis: "right" as const,
      label: "Overbought",
    }
    const { onSave, onSaveBlocked } = renderPanel(
      chartConfig([{ axis: "left" }, { axis: "right" }], [overbought]),
    )

    // When RSI moves to the left axis and the user applies
    await userEvent.click(screen.getByRole("tab", { name: "Q2" }))
    await choose("Y-axis: Right", "Left")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then nothing is saved, and the line keeps its axis control and says why
    expect(onSave).not.toHaveBeenCalled()
    expect(onSaveBlocked).toHaveBeenCalledWith("right_axis_line_without_query")
    const axis = screen.getByRole("button", { name: "Line 1 axis: Right" })
    expect(axis).toHaveAttribute("aria-invalid", "true")
    expect(axis).toHaveAccessibleDescription(
      "No enabled query is on the right axis, so a right-axis line cannot be drawn. Put a query on the right axis, or draw the line on the left.",
    )

    // When the user moves the line to the left and applies again
    await choose("Line 1 axis: Right", "Left")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then the line is saved on the left axis, and the chart draws it there
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.referenceLines).toEqual([{ value: 70, label: "Overbought" }])
    expect(saved.queries[1]?.axis).toBe("left")
    expect(drawnLines(resolve(saved))).toEqual([{ value: 70, axis: 0 }])
  })

  it("offers no axis for the lines while nothing is on the right axis", () => {
    // When
    renderPanel(
      chartConfig([{ axis: "left" }, { axis: "left" }], [{ value: 150 }]),
    )

    // Then
    expect(screen.getByLabelText("Line 1 value")).toHaveValue(150)
    expect(
      screen.queryByRole("button", { name: /^Line 1 axis/ }),
    ).not.toBeInTheDocument()
  })

  it("applies a pie that keeps a right line, since a pie draws no line and hides the editor", async () => {
    // Given a pie, which has no value axis, keeping a right line from before
    const config: ChartConfig = {
      ...chartConfig(
        [{ axis: "left" }, { axis: "left" }],
        [{ value: 70, axis: "right" }],
      ),
      queries: [{ type: "pie", yColumns: ["price"] }, null],
    }
    const { onSave } = renderPanel(config)
    expect(screen.queryByText("Reference lines")).not.toBeInTheDocument()

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].referenceLines).toEqual([
      { value: 70, axis: "right" },
    ])
  })

  it("ignores an emptied right-axis line, which applying drops", async () => {
    // Given
    const { onSave } = renderPanel(
      chartConfig(
        [{ axis: "left" }, { axis: "left" }],
        [{ value: NaN, axis: "right" }],
      ),
    )

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].referenceLines).toBeUndefined()
  })
})

// One rule for where a reference line goes, which the settings panel, the
// agent tools' validation, the chart and the tools' reference_lines
// description (tools.test.ts) all follow; each case is one clause of it.
describe("reference line axes — settings, agent tools and chart agree", () => {
  it.each<{
    rule: string
    placements: [Placement, Placement]
    line: SeriesAxis
    accepted: boolean
    drawnOn: 0 | 1 | null
  }>([
    {
      rule: "a right line with a right query is drawn on the right",
      placements: [{ axis: "left" }, { axis: "right" }],
      line: "right",
      accepted: true,
      drawnOn: 1,
    },
    {
      rule: "a right line with no query on the right is refused",
      placements: [{ axis: "left" }, { axis: "left" }],
      line: "right",
      accepted: false,
      drawnOn: null,
    },
    {
      rule: "a right line whose right query is disabled is refused",
      placements: [{ axis: "left" }, { axis: "right", enabled: false }],
      line: "right",
      accepted: false,
      drawnOn: null,
    },
    {
      rule: "a right line is not drawn while its query returns no rows",
      placements: [{ axis: "left" }, { axis: "right", rows: 0 }],
      line: "right",
      accepted: true,
      drawnOn: null,
    },
    {
      rule: "a left line with a left query is drawn on the left",
      placements: [{ axis: "left" }, { axis: "right" }],
      line: "left",
      accepted: true,
      drawnOn: 0,
    },
    {
      rule: "a left line moves to the right when no query is on the left",
      placements: [{ axis: "right" }, { axis: "right" }],
      line: "left",
      accepted: true,
      drawnOn: 1,
    },
    {
      rule: "a left line is not drawn while its left query returns no rows",
      placements: [{ axis: "right" }, { axis: "left", rows: 0 }],
      line: "left",
      accepted: true,
      drawnOn: null,
    },
  ])("$rule", async ({ placements, line, accepted, drawnOn }) => {
    // Given
    const config = chartConfig(placements, [
      { value: 50, ...(line === "right" && { axis: "right" as const }) },
    ])
    const resolution = resolve(config, [
      placements[0].rows ?? 2,
      placements[1].rows ?? 2,
    ])
    const { onSave } = renderPanel(config, resolution)

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then the settings refuse exactly what the tools refuse, and say why
    expect(onSave).toHaveBeenCalledTimes(accepted ? 1 : 0)
    expect(
      screen.queryByText(/^No enabled query is on the right axis/),
    ).toEqual(accepted ? null : expect.any(HTMLElement))
    expect(hasRightAxisLineWithoutQuery(config)).toBe(!accepted)
    expect(drawnLines(resolution)).toEqual(
      drawnOn === null ? [] : [{ value: 50, axis: drawnOn }],
    )
  })
})
