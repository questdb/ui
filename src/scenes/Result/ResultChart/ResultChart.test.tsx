// @vitest-environment jsdom
import { renderComponent } from "../../../test/component"
import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { EChartsOption } from "echarts"
import { Client, Type } from "../../../utils/questdb"
import { QuestContext } from "../../../providers"
import { ResultChart } from "."
import { preloadChartCode } from "../../Editor/Notebook/CellChart/lazyCharts"

vi.mock("../../../providers", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({}) }
})
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../Editor/Notebook/CellChart/ChartRenderer", async () => {
  const React = await import("react")
  return {
    ChartRenderer: React.forwardRef(function RendererInput(
      { option }: { option: EChartsOption },
      _ref,
    ) {
      return (
        <output aria-label="Renderer input">
          {JSON.stringify(option.series)}
        </output>
      )
    }),
  }
})
vi.mock(
  "../../Editor/Notebook/CellChart/lazyCharts",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../Editor/Notebook/CellChart/lazyCharts")
    >()),
    preloadChartCode: vi.fn(),
  }),
)
vi.mock("../../../components/HighlightedSql", () => ({
  HighlightedSql: () => null,
}))

const result = {
  type: Type.DQL as const,
  query:
    "select timestamp_sequence(0, 1000000) rnd_timestamp, x from long_sequence(10)",
  columns: [
    { name: "rnd_timestamp", type: "TIMESTAMP" },
    { name: "x", type: "LONG" },
  ],
  dataset: Array.from({ length: 10 }, (_, i) => [
    new Date(i * 1000).toISOString(),
    i + 1,
  ]),
  count: 10,
  error: undefined,
  notice: undefined,
  timings: { compiler: 0, authentication: 0, count: 0, execute: 0, fetch: 0 },
}
const series = () =>
  JSON.parse(screen.getByLabelText("Renderer input").textContent || "[]") as {
    type: string
    data: unknown[]
  }[]

describe("result chart settings", () => {
  it("keeps Line until Apply commits Bar with the fetched values", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify(result), { status: 200 })),
      ),
    )
    renderComponent(
      <QuestContext.Provider
        value={{
          quest: new Client(),
          questExecution: {} as React.ContextType<
            typeof QuestContext
          >["questExecution"],
          buildVersion: { type: "oss", version: "test" },
          commitHash: "test",
        }}
      >
        <ResultChart
          result={result}
          visible
          onResetZoomFocus={() => undefined}
        />
      </QuestContext.Provider>,
    )
    await screen.findByLabelText("Renderer input")
    expect(series()[0].type).toBe("line")
    // When
    fireEvent.keyDown(screen.getByRole("button", { name: /^Chart type/ }), {
      key: "Enter",
    })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Bar" }))
    // Then
    expect(series()[0].type).toBe("line")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(series()[0].type).toBe("bar"))
    expect(series()[0].data).toEqual(result.dataset)
  })

  it("explains why Apply cannot draw an over-limit percentage stack", async () => {
    const dense = {
      ...result,
      columns: [...result.columns, { name: "cohort", type: "STRING" }],
      dataset: Array.from({ length: 31 }, (_, i) => [
        new Date(i * 1000).toISOString(),
        i + 1,
        `cohort${i}`,
      ]),
      count: 31,
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify(dense), { status: 200 })),
      ),
    )
    renderComponent(
      <QuestContext.Provider
        value={{
          quest: new Client(),
          questExecution: {} as React.ContextType<
            typeof QuestContext
          >["questExecution"],
          buildVersion: { type: "oss", version: "test" },
          commitHash: "test",
        }}
      >
        <ResultChart
          result={dense}
          visible
          onResetZoomFocus={() => undefined}
        />
      </QuestContext.Provider>,
    )
    await screen.findByLabelText("Renderer input")
    await userEvent.click(screen.getByRole("button", { name: /^Chart type/ }))
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Area" }),
    )
    await userEvent.click(screen.getByRole("button", { name: /^Partition by/ }))
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "cohort" }),
    )
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Stack to 100%/ }),
    )
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "supports up to 30 partitions",
    )
    expect(screen.queryByLabelText("Renderer input")).not.toBeInTheDocument()
  })

  it("starts loading the chart code once the chart view shows", () => {
    // Given a result whose chart view is hidden
    const quest = {
      quest: new Client(),
      questExecution: {} as React.ContextType<
        typeof QuestContext
      >["questExecution"],
      buildVersion: { type: "oss" as const, version: "test" },
      commitHash: "test",
    }
    const view = (visible: boolean) => (
      <QuestContext.Provider value={quest}>
        <ResultChart
          result={result}
          visible={visible}
          onResetZoomFocus={() => undefined}
        />
      </QuestContext.Provider>
    )
    vi.mocked(preloadChartCode).mockClear()
    const { rerender } = renderComponent(view(false))
    expect(preloadChartCode).not.toHaveBeenCalled()

    // When the user switches to the chart
    rerender(view(true))

    // Then the chart code starts loading while the query runs
    expect(preloadChartCode).toHaveBeenCalledOnce()
  })
})
