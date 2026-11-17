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
    ["table", true, true],
    ["matview", true, true],
    ["table", false, true],
    ["matview", false, true],
    ["table", true, false],
  ] as const)(
    "%s (history %s, WAL %s): charts and highlights name columns of their SQL",
    (kind, telemetryEnabled, walEnabled) => {
      const view = buildMonitoringDashboard({
        name: "trades",
        kind,
        telemetryEnabled,
        walEnabled,
      })
      expect(view.cells.some((c) => c.chartConfig || c.highlightConfig)).toBe(
        true,
      )
      expect(unknownColumns(view)).toEqual([])
    },
  )

  it("detects a renamed SQL column", () => {
    const view = buildMonitoringDashboard({
      name: "trades",
      kind: "table",
      telemetryEnabled: true,
      walEnabled: true,
    })
    const charted = view.cells.find((c) => c.chartConfig?.queries[0])!
    const column = charted.chartConfig!.queries[0]!.yColumns[0]
    charted.value = charted.value.replace(`AS "${column}"`, `AS "${column}!"`)
    expect(unknownColumns(view)).toContain(
      `${charted.name}[0] chart: ${column}`,
    )
  })
})
