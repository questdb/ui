// @vitest-environment jsdom
import React, { useState } from "react"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { hasRightAxisLineWithoutQuery } from "../../../../utils/tools/chartConfigWire"
import { resolveDraw } from "../DrawCanvas/drawCanvasUtils"
import { buildEchartsOption } from "./buildEchartsOption"
import { Button } from "../../../../components/Button"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "../settingsDrawer/CellOverlayContext"
import { ChartSettingsDrawer, ChartSettingsPanel } from "./ChartSettingsDrawer"
import {
  CHART_TYPES,
  type ChartConfig,
  type ChartType,
  type ReferenceLine,
  type SeriesAxis,
} from "./chartTypes"

const statements = ["SELECT ts, price FROM t", "SELECT ts, rsi FROM t"]

const REMOVED_ON_SAVE =
  "No enabled query is on the right axis, so right-axis lines are removed on save. To keep a line, put a query on the right axis or draw the line on the left."

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
  const overbought = {
    value: 70,
    axis: "right" as const,
    label: "Overbought",
  }

  it("says a right-axis line is removed on save once its query moves left, and Apply saves without it", async () => {
    // Given price on the left with a target line, RSI on the right, and an
    // overbought line on RSI
    const target = { value: 120, label: "Target" }
    const { onSave, onSaveBlocked } = renderPanel(
      chartConfig([{ axis: "left" }, { axis: "right" }], [overbought, target]),
    )

    // When RSI moves to the left axis
    await userEvent.click(screen.getByRole("tab", { name: "Q2" }))
    await choose("Y-axis: Right", "Left")

    // Then the line keeps its axis control, which says it is removed on save
    const axis = screen.getByRole("button", { name: "Line 1 axis: Right" })
    expect(axis).toHaveAttribute("aria-invalid", "true")
    expect(axis).toHaveAccessibleDescription(REMOVED_ON_SAVE)

    // When the user applies
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then the settings are saved without the right-axis line, and the chart
    // draws the target line on the left
    expect(onSaveBlocked).not.toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.referenceLines).toEqual([target])
    expect(saved.queries[1]?.axis).toBe("left")
    expect(drawnLines(resolve(saved))).toEqual([{ value: 120, axis: 0 }])
  })

  it("saves a right-axis line on the left once the user moves it there after its query", async () => {
    // Given price on the left, RSI on the right, and an overbought line on RSI
    const { onSave } = renderPanel(
      chartConfig([{ axis: "left" }, { axis: "right" }], [overbought]),
    )

    // When RSI and then the line move to the left axis, and the user applies
    await userEvent.click(screen.getByRole("tab", { name: "Q2" }))
    await choose("Y-axis: Right", "Left")
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

  it("drops on Apply a pie's right line that no right query backs, though a pie hides the editor", async () => {
    // Given a pie, which has no value axis, keeping a left line and a right
    // line from before, with no query on the right axis
    const config: ChartConfig = {
      ...chartConfig(
        [{ axis: "left" }, { axis: "left" }],
        [{ value: 70, axis: "right" }, { value: 30 }],
      ),
      queries: [{ type: "pie", yColumns: ["price"] }, null],
    }
    const { onSave } = renderPanel(config)
    expect(screen.queryByText("Reference lines")).not.toBeInTheDocument()

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then the right line is dropped, so the agent tools accept the config
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.referenceLines).toEqual([{ value: 30 }])
    expect(hasRightAxisLineWithoutQuery(saved)).toBe(false)
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

// A number field holding text that is not a number reads as empty and
// reports badInput; jsdom keeps no such text, so the field reports it here.
const typeTextThatIsNotANumber = (field: HTMLElement) => {
  Object.defineProperty(field, "validity", {
    configurable: true,
    value: { badInput: true },
  })
  fireEvent.input(field, { target: { value: "" } })
  Reflect.deleteProperty(field, "validity")
}

const NOT_A_NUMBER = "Should be a number"

// Save refuses a line with a label or typed text but no number, and its Value
// field says why; an entirely empty row is dropped on save, silently, and so
// is a line save drops anyway: a right line no right query backs, or a line
// of a pie, which hides the lines.
describe("ChartSettingsPanel — a reference line without a number", () => {
  const lineChart = chartConfig([{ axis: "left" }, { axis: "left" }], [])

  it.each<{
    row: string
    config: ChartConfig
    edit: () => Promise<void>
    refused: boolean
  }>([
    {
      row: "a label and an empty value",
      config: lineChart,
      edit: async () => {
        await userEvent.click(
          screen.getByRole("button", { name: "+ Add line" }),
        )
        await userEvent.type(screen.getByLabelText("Line 1 label"), "Target")
      },
      refused: true,
    },
    {
      row: "a value that is not a number and no label",
      config: lineChart,
      edit: async () => {
        await userEvent.click(
          screen.getByRole("button", { name: "+ Add line" }),
        )
        typeTextThatIsNotANumber(screen.getByLabelText("Line 1 value"))
      },
      refused: true,
    },
    {
      row: "a label and an emptied value",
      config: {
        ...lineChart,
        referenceLines: [{ value: 120, label: "Target" }],
      },
      edit: () => userEvent.clear(screen.getByLabelText("Line 1 value")),
      refused: true,
    },
    {
      row: "a label typed and cleared, and an empty value",
      config: lineChart,
      edit: async () => {
        await userEvent.click(
          screen.getByRole("button", { name: "+ Add line" }),
        )
        await userEvent.type(screen.getByLabelText("Line 1 label"), "Target")
        await userEvent.clear(screen.getByLabelText("Line 1 label"))
      },
      refused: false,
    },
    {
      row: "a value that was not a number, then was one, and was emptied",
      config: lineChart,
      edit: async () => {
        await userEvent.click(
          screen.getByRole("button", { name: "+ Add line" }),
        )
        const field = screen.getByLabelText("Line 1 value")
        typeTextThatIsNotANumber(field)
        await userEvent.type(field, "70")
        await userEvent.clear(field)
      },
      refused: false,
    },
    {
      row: "nothing",
      config: lineChart,
      edit: () =>
        userEvent.click(screen.getByRole("button", { name: "+ Add line" })),
      refused: false,
    },
    {
      row: "a label and an empty value, on a right axis no query backs",
      config: chartConfig(
        [{ axis: "left" }, { axis: "left" }],
        [{ value: NaN, axis: "right", label: "Overbought" }],
      ),
      edit: () => Promise.resolve(),
      refused: false,
    },
    {
      row: "a label and an empty value, on a pie",
      config: {
        ...chartConfig(
          [{ axis: "left" }, { axis: "left" }],
          [{ value: NaN, label: "Target" }],
        ),
        queries: [{ type: "pie", yColumns: ["price"] }, null],
      },
      edit: () => Promise.resolve(),
      refused: false,
    },
  ])(
    "a row with $row: Apply refused ($refused)",
    async ({ config, edit, refused }) => {
      // Given
      const { onSave, onSaveBlocked } = renderPanel(config)
      await edit()

      // When
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      // Then
      if (refused) {
        expect(onSave).not.toHaveBeenCalled()
        expect(onSaveBlocked).toHaveBeenCalledWith(
          "reference_line_without_value",
        )
        const field = screen.getByLabelText("Line 1 value")
        expect(field).toHaveAttribute("aria-invalid", "true")
        expect(field).toHaveAccessibleDescription(NOT_A_NUMBER)
        expect(field).toHaveFocus()
      } else {
        expect(onSaveBlocked).not.toHaveBeenCalled()
        expect(onSave).toHaveBeenCalledTimes(1)
        expect(onSave.mock.calls[0][0].referenceLines).toBeUndefined()
        expect(screen.queryByText(NOT_A_NUMBER)).not.toBeInTheDocument()
      }
    },
  )

  it("shows the error only on the line without a number, and saves once it has one", async () => {
    // Given a kept line and a labelled line without a number
    const { onSave } = renderPanel({
      ...lineChart,
      referenceLines: [{ value: 30, label: "Oversold" }],
    })
    await userEvent.click(screen.getByRole("button", { name: "+ Add line" }))
    await userEvent.type(screen.getByLabelText("Line 2 label"), "Overbought")

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Line 1 value")).not.toHaveAttribute(
      "aria-invalid",
    )
    expect(screen.getAllByText(NOT_A_NUMBER)).toHaveLength(1)
    const field = screen.getByLabelText("Line 2 value")
    expect(field).toHaveFocus()

    // When the user types its number
    await userEvent.type(field, "70")

    // Then the error is gone, and Apply saves both lines
    expect(screen.queryByText(NOT_A_NUMBER)).not.toBeInTheDocument()
    expect(field).not.toHaveAttribute("aria-invalid")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].referenceLines).toEqual([
      { value: 30, label: "Oversold" },
      { value: 70, label: "Overbought" },
    ])
  })
})

// Like DrawCanvas: the drawer saves into the cell's config and closes.
const DrawerFixture = ({
  initial,
  onSave,
}: {
  initial: ChartConfig
  onSave: (config: ChartConfig) => void
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(initial)
  const resolution = resolve(config)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Chart settings</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <ChartSettingsDrawer
          open={open}
          appearInPlace
          initialDraft={null}
          onDraftChange={() => undefined}
          tabs={resolution.tabs}
          config={resolution.effectiveConfig}
          onSave={(next) => {
            onSave(next)
            setConfig(next)
          }}
          onClose={() => setOpen(false)}
        />
      </CellOverlayProvider>
    </>
  )
}

describe("ChartSettingsDrawer — a reference line without a number", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )
  })

  it("stays open on Save while a labelled line has no number, and saves it once it has one", async () => {
    // Given a line chart, and a line with a label but no value
    const onSave = vi.fn<[ChartConfig], void>()
    renderComponent(
      <DrawerFixture
        initial={chartConfig([{ axis: "left" }, { axis: "left" }], [])}
        onSave={onSave}
      />,
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Chart settings" }),
    )
    await userEvent.click(screen.getByRole("button", { name: "+ Add line" }))
    await userEvent.type(screen.getByLabelText("Line 1 label"), "Overbought")
    const field = screen.getByLabelText("Line 1 value")
    const describedOnFocus: string[] = []
    field.addEventListener("focus", () =>
      describedOnFocus.push(field.getAttribute("aria-describedby") ?? ""),
    )

    // When
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then the drawer stays open, and focus lands on the Value field once it
    // says why
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(field).toHaveAccessibleDescription(NOT_A_NUMBER)
    expect(field).toHaveFocus()
    expect(describedOnFocus).toEqual([
      screen.getByText(NOT_A_NUMBER).getAttribute("id"),
    ])

    // When the user types the number and saves
    await userEvent.type(field, "70")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then the line is saved, and the drawer closes
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].referenceLines).toEqual([
      { value: 70, label: "Overbought" },
    ])
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument()
  })
})

// One rule for where a reference line goes, which the settings panel, the
// agent tools' validation, the chart and the tools' reference_lines
// description (tools.test.ts) all follow; each case is one clause of it. The
// tools refuse a right line no enabled right query backs; the settings drop
// it on save, so the tools accept every config the settings save.
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
      rule: "a right line with no query on the right is refused by the tools and dropped by the settings",
      placements: [{ axis: "left" }, { axis: "left" }],
      line: "right",
      accepted: false,
      drawnOn: null,
    },
    {
      rule: "a right line whose right query is disabled is refused by the tools and dropped by the settings",
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
    const referenceLine: ReferenceLine = {
      value: 50,
      ...(line === "right" && { axis: "right" as const }),
    }
    const config = chartConfig(placements, [referenceLine])
    const resolution = resolve(config, [
      placements[0].rows ?? 2,
      placements[1].rows ?? 2,
    ])
    const { onSave } = renderPanel(config, resolution)

    // When
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Then the settings save, dropping exactly the line the tools refuse and
    // saying so beforehand; the tools accept what the settings save
    expect(hasRightAxisLineWithoutQuery(config)).toBe(!accepted)
    expect(screen.queryByText(REMOVED_ON_SAVE)).toEqual(
      accepted ? null : expect.any(HTMLElement),
    )
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.referenceLines).toEqual(accepted ? [referenceLine] : undefined)
    expect(hasRightAxisLineWithoutQuery(saved)).toBe(false)
    expect(drawnLines(resolution)).toEqual(
      drawnOn === null ? [] : [{ value: 50, axis: drawnOn }],
    )
  })
})

// Q1 returns a time, a category and OHLC prices, so it can be drawn as any
// chart type; Q2 is RSI.
const anyTypeResult = (): QueryExecResult => {
  const dataset = [
    ["2024-01-01T00:00:00.000000Z", "BTC", 100, 110, 95, 105],
    ["2024-01-02T00:00:00.000000Z", "ETH", 105, 115, 100, 112],
  ]
  return {
    type: "dql",
    query: "SELECT ts, sym, open, high, low, close FROM t",
    columns: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "sym", type: "SYMBOL" },
      { name: "open", type: "DOUBLE" },
      { name: "high", type: "DOUBLE" },
      { name: "low", type: "DOUBLE" },
      { name: "close", type: "DOUBLE" },
    ],
    dataset,
    count: dataset.length,
  }
}

const anyTypeConfig = (type: ChartType, rsi: Placement): ChartConfig => ({
  xColumn: "ts",
  queries: [
    {
      type,
      yColumns: ["close"],
      ...(type === "candlestick" && {
        ohlc: { open: "open", high: "high", low: "low", close: "close" },
      }),
    },
    {
      type: "line",
      yColumns: ["rsi"],
      axis: rsi.axis,
      ...(rsi.enabled === false && { enabled: false }),
    },
  ],
  referenceLines: [
    { value: 70, axis: "right", label: "Overbought" },
    { value: 30 },
  ],
})

// The chart settings drop, on save, every right-axis line that no enabled
// right-axis query backs, whatever the chart type: Apply is never refused for
// it, and the agent tools accept every config the settings save.
describe("right-axis lines on save — every chart type", () => {
  it.each(
    CHART_TYPES.flatMap((type) => [
      {
        type,
        placement: "RSI on the left",
        rsi: { axis: "left" as const },
        kept: false,
      },
      {
        type,
        placement: "RSI excluded on the right",
        rsi: { axis: "right" as const, enabled: false },
        kept: false,
      },
      {
        type,
        placement: "RSI on the right",
        rsi: { axis: "right" as const },
        kept: true,
      },
    ]),
  )(
    "$type chart, $placement: the right line is kept ($kept)",
    async ({ type, rsi, kept }) => {
      // Given
      const config = anyTypeConfig(type, rsi)
      const resolution = resolveDraw(
        ["SELECT ts, sym, open, high, low, close FROM t", statements[1]],
        [
          { ...anyTypeResult(), statementIndex: 0 },
          { ...result(1, 2), statementIndex: 1 },
        ],
        config,
      )
      const { onSave, onSaveBlocked } = renderPanel(config, resolution)

      // When
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      // Then
      expect(onSaveBlocked).not.toHaveBeenCalled()
      expect(onSave).toHaveBeenCalledTimes(1)
      const saved = onSave.mock.calls[0][0]
      expect(saved.queries[0]?.type).toBe(type)
      expect(saved.referenceLines).toEqual(
        kept
          ? [{ value: 70, axis: "right", label: "Overbought" }, { value: 30 }]
          : [{ value: 30 }],
      )
      expect(hasRightAxisLineWithoutQuery(saved)).toBe(false)
    },
  )
})
