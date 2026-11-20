// @vitest-environment jsdom
import { renderComponent } from "../../../test/component"
import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { EChartsOption } from "echarts"
import { Client, Type } from "../../../utils/questdb"
import { QuestContext } from "../../../providers"
import { ResultChart, type ResultChartTransfer } from "."

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
})

describe("result chart notebook transfer", () => {
  it("offers the frame only once its data is ready, with the applied settings", async () => {
    let respond!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve
          }),
      ),
    )
    const onTransferChange = vi.fn<[ResultChartTransfer | undefined], void>()
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
          onTransferChange={onTransferChange}
        />
      </QuestContext.Provider>,
    )
    const latest = (): ResultChartTransfer | undefined =>
      onTransferChange.mock.calls.at(-1)?.[0]
    expect(latest()).toBeUndefined()

    respond(new Response(JSON.stringify(result), { status: 200 }))
    await waitFor(() => expect(latest()).toBeDefined())
    expect(latest()?.seed).toBe(result)
    expect(latest()?.query).toMatchObject({
      sql: result.query,
      result: { type: "dql", dataset: result.dataset },
    })
    expect(latest()?.query.chartConfig?.queries[0]?.type).toBe("line")

    fireEvent.keyDown(screen.getByRole("button", { name: /^Chart type/ }), {
      key: "Enter",
    })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() =>
      expect(latest()?.query.chartConfig?.queries[0]?.type).toBe("bar"),
    )
  })
})
