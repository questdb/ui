// @vitest-environment node
import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import { echarts } from "../CellChart/echartsSetup"
import type { StatementRows } from "../visuals/statementRows"
import { enforceSinks } from "./sinks"
import { checkCustomOption, prepareCustomOption } from "./prepareCustomOption"

const problemsOf = (option: Record<string, unknown>) => {
  const problems: { path: string; severity?: string }[] = []
  const safe = enforceSinks(option, (path, _message, severity) =>
    problems.push({ path, severity }),
  )
  return { safe, problems }
}

describe("enforceSinks", () => {
  it("drops links a title can open, also from the option a title falls back to", () => {
    // Given
    const { safe, problems } = problemsOf({
      link: "https://example.invalid/phish",
      target: "self",
      title: { text: "Fill", link: "javascript:alert(1)", target: "self" },
      series: [{ type: "bar" }],
    })

    // Then
    expect(safe).toEqual({ title: { text: "Fill" }, series: [{ type: "bar" }] })
    expect(problems.map((p) => p.path)).toEqual([
      "link",
      "target",
      "title.link",
      "title.target",
    ])
  })

  it("drops tree links at the series, its levels and every node, but keeps a link's target node", () => {
    // Given a treemap that would inherit links into its nodes, and a Sankey
    // whose links name their target node
    const { safe } = problemsOf({
      series: [
        {
          type: "treemap",
          link: "https://a",
          levels: [{ link: "https://b" }],
          data: [
            {
              name: "x",
              link: "https://c",
              children: [{ name: "y", target: "_top" }],
            },
          ],
        },
        {
          type: "sankey",
          links: [{ source: "a", target: "b", value: 1 }],
        },
      ],
    })

    // Then
    expect(safe.series).toEqual([
      {
        type: "treemap",
        levels: [{}],
        data: [{ name: "x", children: [{ name: "y" }] }],
      },
      { type: "sankey", links: [{ source: "a", target: "b", value: 1 }] },
    ])
  })

  it("draws every tooltip as rich text and drops its DOM options, without escaping text", () => {
    // Given HTML in templates, at the root and on a series
    const { safe } = problemsOf({
      tooltip: {
        formatter: "<img src=x onerror=alert(1)> {b}",
        extraCssText: "position:fixed",
        renderMode: "html",
      },
      series: [{ type: "line", tooltip: "S&P 500" }],
    })

    // Then the text is kept as written: rich text never reads it as HTML
    expect(safe.tooltip).toEqual({
      formatter: "<img src=x onerror=alert(1)> {b}",
      renderMode: "richText",
    })
    expect((safe.series as { tooltip: unknown }[])[0].tooltip).toEqual({
      formatter: "S&P 500",
      renderMode: "richText",
    })
  })

  it("allows only data: images, as symbols and as image fields", () => {
    // Given
    const { safe } = problemsOf({
      series: [
        { type: "scatter", symbol: "image://https://evil.example/beacon.png" },
        { type: "scatter", symbol: "image://data:image/png;base64,AAAA" },
      ],
      graphic: [
        { type: "image", style: { image: "https://evil.example/x.png" } },
      ],
      title: {
        textStyle: { rich: { a: { backgroundColor: { image: "https://x" } } } },
      },
    })

    // Then
    expect(safe.series).toEqual([
      { type: "scatter", symbol: "circle" },
      { type: "scatter", symbol: "image://data:image/png;base64,AAAA" },
    ])
    expect(safe.graphic).toEqual([{ type: "image", style: {} }])
    expect(safe.title).toEqual({
      textStyle: { rich: { a: { backgroundColor: {} } } },
    })
  })

  it("leaves the cell's datasets, which are data shown as text, as they are", () => {
    const dataset = [{ source: [["image://https://x", "https://y"]] }]
    expect(problemsOf({ dataset }).safe.dataset).toBe(dataset)
  })
})

// Attack strings, placed in every slot that can take them, in the option
// and in bound rows; the drawn chart is checked through ECharts' own model,
// which applies its inheritance (a title falls back to the option's link, a
// tree node to its level's and its series').
describe("the drawn option, as ECharts resolves it", () => {
  const URL = "https://evil.example/x"
  const rows: StatementRows = {
    columns: [
      { name: "sector", type: "SYMBOL" },
      { name: "v", type: "DOUBLE" },
      { name: "sym", type: "VARCHAR" },
    ],
    rows: [
      ["a", 1, `image://${URL}`],
      ["b", 2, `image://${URL}`],
    ],
  }
  const draw = (raw: Record<string, unknown>) => {
    const { built } = prepareCustomOption(raw, {
      colors: lightColors,
      statements: [rows],
      live: false,
    })
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 400,
      height: 300,
    })
    chart.setOption(built.option)
    return chart as unknown as {
      getModel(): {
        getComponent(type: string): { get(key: string): unknown } | undefined
        getSeriesByIndex(i: number): {
          getData(): {
            count(): number
            getItemModel(i: number): { get(key: string): unknown }
            getItemVisual(i: number, key: string): unknown
          }
        }
      }
      getOption(): Record<string, unknown>
      dispose(): void
    }
  }

  it.each([
    ["the option's own link", { link: URL, title: { text: "t" } }],
    ["a title link", { title: { text: "t", link: URL, sublink: URL } }],
  ])("opens no page from a title with %s", (_, raw) => {
    const chart = draw({
      ...raw,
      xAxis: { type: "category", data: ["a"] },
      yAxis: {},
      series: [{ type: "bar", data: [1] }],
    })
    try {
      const title = chart.getModel().getComponent("title")
      expect(title?.get("link")).toBeFalsy()
      expect(title?.get("sublink")).toBeFalsy()
    } finally {
      chart.dispose()
    }
  })

  it("opens no page from any node of a tree bound from rows", () => {
    const chart = draw({
      series: [
        {
          type: "treemap",
          link: URL,
          levels: [{ link: URL }, { link: URL }],
          data: { $rows: { shape: "tree", path: ["sector"], value: "v" } },
        },
      ],
    })
    try {
      const data = chart.getModel().getSeriesByIndex(0).getData()
      for (let i = 0; i < data.count(); i++)
        expect(data.getItemModel(i).get("link")).toBeFalsy()
    } finally {
      chart.dispose()
    }
  })

  it("draws the tooltip as rich text and loads no image from a bound row", () => {
    const chart = draw({
      tooltip: { formatter: `<img src="${URL}">`, renderMode: "html" },
      xAxis: { type: "category" },
      yAxis: {},
      series: [
        {
          type: "scatter",
          data: { $rows: { shape: "items", name: "sym", value: "v" } },
          symbol: `image://${URL}`,
          markLine: {
            symbol: { $rows: { shape: "column", column: "sym" } },
            data: [{ yAxis: 1 }],
          },
        },
      ],
    })
    try {
      expect(chart.getModel().getComponent("tooltip")?.get("renderMode")).toBe(
        "richText",
      )
      // The cell's datasets hold the rows as data (text); nothing else may.
      const { dataset: _rows, ...drawn } = chart.getOption()
      expect(JSON.stringify(drawn)).not.toContain(`image://${URL}`)
    } finally {
      chart.dispose()
    }
  })
})

describe("checkCustomOption", () => {
  it("reports what a saved option would lose before any rows are bound", () => {
    expect(
      checkCustomOption(
        { title: { link: URL_OF_TEST }, series: [{ type: "bar" }] },
        lightColors,
      ).map((p) => p.path),
    ).toEqual(["title.link"])
  })
})

const URL_OF_TEST = "https://evil.example/y"
