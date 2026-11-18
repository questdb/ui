import { describe, expect, it } from "vitest"
import { buildMonitoringDashboard } from "./dashboard"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import type { NotebookViewState } from "../../store/notebook"

// The output columns a template statement names. Templates quote their output
// aliases (`AS "Rows/s"`) and keep inner CTE aliases unquoted; the one
// unaliased output is the leading `x.created` timestamp.
const outputColumns = (sql: string): string[] => {
  const names = [...sql.matchAll(/\bAS\s+"([^"]+)"/gi)].map((m) => m[1])
  const created = /^\s*SELECT\s+[a-z]+\.(created)\s*,/i.exec(sql)
  return created ? [created[1], ...names] : names
}

// Chart axes and highlight columns that do not name a column of their SQL.
const unknownColumns = (view: NotebookViewState): string[] => {
  const problems: string[] = []
  for (const cell of view.cells) {
    if (cell.type === "markdown") continue
    const statements = getQueriesFromText(cell.value).map(outputColumns)
    const { chartConfig, highlightConfig } = cell
    if (chartConfig) {
      if (statements.length !== chartConfig.queries.length)
        problems.push(`${cell.name}: statement count`)
      chartConfig.queries.forEach((query, index) => {
        for (const column of [chartConfig.xColumn, ...(query?.yColumns ?? [])])
          if (!statements[index]?.includes(column as string))
            problems.push(`${cell.name}[${index}] chart: ${column}`)
      })
    }
    if (highlightConfig) {
      const columns = statements.flat()
      for (const column of [
        ...highlightConfig.identityColumns,
        ...highlightConfig.rules.flatMap((rule) =>
          rule.kind !== "newRow" && rule.target.kind === "column"
            ? [rule.target.name]
            : [],
        ),
      ])
        if (!columns.includes(column))
          problems.push(`${cell.name} highlight: ${column}`)
    }
  }
  return problems
}

describe("monitoring template columns", () => {
  it.each([
    ["table", true],
    ["matview", true],
    ["table", false],
    ["matview", false],
  ] as const)(
    "%s (telemetry %s): charts and highlights name columns of their SQL",
    (kind, telemetryEnabled) => {
      const view = buildMonitoringDashboard({
        name: "trades",
        kind,
        telemetryEnabled,
      })
      expect(view.cells.some((c) => c.chartConfig || c.highlightConfig)).toBe(
        true,
      )
      expect(unknownColumns(view)).toEqual([])
    },
  )

  // SAMPLE BY omits empty buckets, and a line joins the points it gets. For a
  // rate or count an idle bucket is a real 0, so it must be filled across the
  // whole window (FROM … TO), or idle time is drawn as its neighbours' rate and
  // a stalled target's chart just ends at its last event. A duration or ratio has no value in
  // an idle bucket: FILL(NULL) would isolate every sparse event (an hourly
  // refresh in minute buckets) and the line would draw nothing.
  const RATE_CHARTS = {
    table: [
      "Ingestion · rows/s",
      "Transactions · txns/s",
      "Write workload · rows/s",
    ],
    matview: ["Refreshes per minute", "View output · rows/s"],
  }
  it.each(["table", "matview"] as const)(
    "%s: rate charts fill the window's idle buckets with 0, other charts never fill",
    (kind) => {
      const view = buildMonitoringDashboard({
        name: "trades",
        kind,
        telemetryEnabled: true,
      })
      const sampled = view.cells
        .filter((cell) => cell.chartConfig)
        .flatMap((cell) =>
          getQueriesFromText(cell.value).map((sql) => ({
            name: cell.name ?? "",
            sql,
          })),
        )
        .filter(({ sql }) => /\bSAMPLE BY\b/i.test(sql))
      const rates = sampled.filter(({ name }) =>
        RATE_CHARTS[kind].includes(name),
      )
      expect(new Set(rates.map(({ name }) => name))).toEqual(
        new Set(RATE_CHARTS[kind]),
      )
      for (const { name, sql } of sampled)
        expect([
          name,
          /\bSAMPLE BY \w+ FROM [\s\S]+ TO [\s\S]+ FILL\(0(,0)*\)$/i.test(
            sql.trim(),
          ),
        ]).toEqual([name, RATE_CHARTS[kind].includes(name)])
      expect(sampled.filter(({ sql }) => /FILL\(NULL\)/i.test(sql))).toEqual([])
    },
  )

  it("detects a renamed SQL column", () => {
    const view = buildMonitoringDashboard({
      name: "trades",
      kind: "table",
      telemetryEnabled: true,
    })
    const charted = view.cells.find((c) => c.chartConfig?.queries[0])!
    const column = charted.chartConfig!.queries[0]!.yColumns[0]
    charted.value = charted.value.replace(`AS "${column}"`, `AS "${column}!"`)
    expect(unknownColumns(view)).toContain(
      `${charted.name}[0] chart: ${column}`,
    )
  })
})
