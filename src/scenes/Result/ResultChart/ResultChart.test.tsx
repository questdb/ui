// @vitest-environment jsdom
import { renderComponent } from "../../../test/component"
import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { EChartsOption } from "echarts"
import { Client, Type } from "../../../utils/questdb"
import { QuestContext } from "../../../providers"
import { ResultChart } from "."

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

const heatmapResult: typeof result = {
  ...result,
  query: "SELECT * FROM measurements",
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "site", type: "SYMBOL" },
    { name: "reading", type: "DECIMAL(10,3)" },
    { name: "baseline", type: "DOUBLE" },
  ],
  dataset: [["2026-01-01T00:00:00Z", "west", "0.125", 2]],
  count: 1,
}

const mockResults = (...results: (typeof result)[]) => {
  const fetch = vi.fn((..._args: Parameters<typeof globalThis.fetch>) => {
    const next = results.shift()
    if (!next) throw new Error("Unexpected chart fetch")
    return Promise.resolve(new Response(JSON.stringify(next), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

const resultChart = (seed: typeof result, quest: Client) => (
  <QuestContext.Provider
    value={{
      quest,
      questExecution: {} as React.ContextType<
        typeof QuestContext
      >["questExecution"],
      buildVersion: { type: "oss", version: "test" },
      commitHash: "test",
    }}
  >
    <ResultChart result={seed} visible onResetZoomFocus={() => undefined} />
  </QuestContext.Provider>
)

const choose = async (control: RegExp, value: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: control }), {
    key: "Enter",
  })
  fireEvent.click(await screen.findByRole("menuitemradio", { name: value }))
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  )
}

describe("result chart settings", () => {
  it("keeps Line until Apply commits Bar with the fetched values", async () => {
    // Given
    mockResults(result)
    renderComponent(resultChart(result, new Client()))
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

  it("keeps the selected lines through an uncommitted Heatmap detour", async () => {
    const quest = new Client()
    const lineResult = {
      ...heatmapResult,
      columns: heatmapResult.columns.map((column) =>
        column.name === "reading" ? { ...column, type: "DOUBLE" } : column,
      ),
      dataset: [["2026-01-01T00:00:00Z", "west", 0.125, 2]],
    }
    mockResults(lineResult)
    renderComponent(resultChart(lineResult, quest))
    await screen.findByLabelText("Renderer input")
    expect(series().map((s) => s.type)).toEqual(["line", "line"])

    await choose(/^Chart type/, "Heatmap")
    expect(
      screen.getByRole("button", { name: "Value column: reading" }),
    ).toBeVisible()
    await choose(/^Chart type/, "Line")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(series().map((s) => s.type)).toEqual(["line", "line"])

    await choose(/^Chart type/, "Heatmap")
    await choose(/^Value column/, "baseline")
    await choose(/^Chart type/, "Line")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(series().map((s) => s.type)).toEqual(["line"])
  })

  it.each(["site", "reading"])(
    "guides the user when same-SQL results lose the heatmap %s field",
    async (missing) => {
      const first = {
        ...heatmapResult,
        columns: heatmapResult.columns.slice(0, 3),
        dataset: heatmapResult.dataset.map((row) => row.slice(0, 3)),
      }
      const next = {
        ...heatmapResult,
        columns: heatmapResult.columns.filter((col) => col.name !== missing),
        dataset: heatmapResult.dataset.map((row) =>
          row.filter((_, idx) => heatmapResult.columns[idx].name !== missing),
        ),
      }
      const quest = new Client()
      const fetch = mockResults(first, next)
      const view = renderComponent(resultChart(first, quest))
      await screen.findByLabelText("Renderer input")
      await choose(/^Chart type/, "Heatmap")
      await choose(/^Value column/, "reading")
      fireEvent.click(screen.getByRole("button", { name: "Apply" }))
      expect(series()[0].type).toBe("custom")

      view.rerender(resultChart(next, quest))

      expect(
        await screen.findByText(/This heatmap needs an X-axis/),
      ).toHaveTextContent("Update Chart settings.")
      expect(screen.queryByLabelText("Renderer input")).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^Chart type: Heatmap/ }),
      ).toBeVisible()
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )
})
