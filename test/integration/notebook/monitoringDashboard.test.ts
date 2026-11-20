import "../../../src/test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildMonitoringDashboard } from "../../../src/utils/monitoring/dashboard"
import { getQueriesFromText } from "../../../src/scenes/Editor/Monaco/utils"
import { Client } from "../../../src/utils/questdb"
import { executeSingleRaw } from "../../../src/utils/executeSingleRaw"
import { monitoringResponse } from "./monitoringFixtures"

afterEach(() => {
  vi.unstubAllGlobals()
})

const variants = [
  {
    label: "WAL table with history",
    kind: "table",
    telemetryEnabled: true,
  },
  {
    label: "materialized view with history",
    kind: "matview",
    telemetryEnabled: true,
  },
  {
    label: "WAL table without history",
    kind: "table",
    telemetryEnabled: false,
  },
  {
    label: "materialized view without history",
    kind: "matview",
    telemetryEnabled: false,
  },
] as const

const mockTransport = () => {
  const transport = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
  vi.stubGlobal("fetch", transport)
  return transport
}
const requestQuery = (input: Parameters<typeof fetch>[0]) => {
  if (typeof input !== "string") throw new Error("Expected an exec URL")
  return new URL(input, "http://localhost/").searchParams.get("query")!
}
const numeric = /^(BYTE|SHORT|INT|LONG|FLOAT|DOUBLE|DECIMAL)/

describe("monitoring template execution integration", () => {
  it.each(variants)(
    "maps HTTP results to every panel: $label",
    async (variant) => {
      // Given a generated dashboard and fixed server response fixtures
      const dashboard = buildMonitoringDashboard({ ...variant, name: "trades" })
      const transport = mockTransport()
      const client = new Client()
      let queried = 0

      for (const cell of dashboard.cells) {
        if (cell.type === "markdown") continue
        const queries = getQueriesFromText(cell.value)
        for (const [index, query] of queries.entries()) {
          const fixture = monitoringResponse(cell.name!, variant.kind, index)
          transport.mockResolvedValueOnce(new Response(JSON.stringify(fixture)))

          // When the real notebook executor expands variables and parses HTTP data
          const result = await executeSingleRaw(
            client,
            query,
            dashboard.settings?.variables,
          )
          const sent = requestQuery(transport.mock.calls[queried][0])
          queried++

          // Then results keep the columns needed by charts and grid highlights
          const label = `${variant.label}: ${cell.name} [${index}]`
          expect(result.type, label).toBe("dql")
          expect(result.dataset, label).toEqual(fixture.dataset)
          expect(sent, label).toContain("'trades'")
          expect(sent, label).not.toContain("__TARGET")
          expect(sent, label).toMatch(/^DECLARE\s+@window_minutes := 30\b/)
          if (variant.kind === "matview" && variant.telemetryEnabled)
            expect(sent, label).toContain("@incident_hours := 24")
          else expect(sent, label).not.toContain("@incident_hours")
          expect(result.effectiveQuery, label).toBe(sent)
          // View refresh telemetry follows the setting; WAL telemetry does not.
          if (!variant.telemetryEnabled)
            expect(sent, label).not.toContain("sys.telemetry_mat_view")
          const names = result.columns.map((column) => column.name)
          if (cell.chartConfig) {
            const chart = cell.chartConfig.queries[index]
            expect(chart, label).toBeDefined()
            expect(names, label).toContain(cell.chartConfig.xColumn)
            for (const name of chart!.yColumns ?? []) {
              expect(names, label).toContain(name)
              expect(
                result.columns.find((column) => column.name === name)?.type,
                label,
              ).toMatch(numeric)
            }
          }
          if (cell.highlightConfig) {
            for (const name of cell.highlightConfig.identityColumns)
              expect(names, `${label}: identity ${name}`).toContain(name)
            for (const rule of cell.highlightConfig.rules) {
              if (rule.kind === "newRow" || rule.target.kind !== "column")
                continue
              expect(
                names,
                `${label}: highlight ${rule.target.name}`,
              ).toContain(rule.target.name)
            }
          }
        }
        if (cell.chartConfig)
          expect(queries.length, cell.name).toBe(
            cell.chartConfig.queries.length,
          )
      }
      expect(queried).toBeGreaterThan(0)
      expect(transport).toHaveBeenCalledTimes(queried)
    },
  )

  it("preserves a quoted table name through variable expansion and HTTP encoding", async () => {
    const name = "desk's trades & quotes"
    const dashboard = buildMonitoringDashboard({
      name,
      kind: "table",
      telemetryEnabled: false,
    })
    const health = dashboard.cells.find(
      (cell) => cell.name === "Live table health",
    )!
    const transport = mockTransport()
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify(monitoringResponse(health.name!, "table", 0, name)),
      ),
    )

    const result = await executeSingleRaw(
      new Client(),
      health.value,
      dashboard.settings?.variables,
    )

    expect(requestQuery(transport.mock.calls[0][0])).toContain(
      "table_name='desk''s trades & quotes'",
    )
    expect(result.dataset[0][0]).toBe(name)
  })

  it("keeps an empty history response successful with its chart columns intact", async () => {
    const dashboard = buildMonitoringDashboard({
      name: "trades",
      kind: "matview",
      telemetryEnabled: true,
    })
    const cell = dashboard.cells.find(
      (cell) => cell.name === "Refresh duration · ms",
    )!
    const fixture = monitoringResponse(cell.name!, "matview")
    const transport = mockTransport()
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...fixture, dataset: [], count: 0 })),
    )

    const result = await executeSingleRaw(
      new Client(),
      cell.value,
      dashboard.settings?.variables,
    )

    expect(result).toMatchObject({
      type: "dql",
      dataset: [],
      count: 0,
      columns: fixture.columns,
    })
  })

  it("surfaces an unavailable telemetry table as a query error", async () => {
    const dashboard = buildMonitoringDashboard({
      name: "trades",
      kind: "table",
      telemetryEnabled: true,
    })
    const cell = dashboard.cells.find(
      (cell) => cell.name === "Ingestion · rows/s",
    )!
    const transport = mockTransport()
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          query: cell.value,
          error: "table does not exist [table=sys.telemetry_wal]",
          position: 0,
        }),
        { status: 400 },
      ),
    )

    const result = await executeSingleRaw(
      new Client(),
      cell.value,
      dashboard.settings?.variables,
    )

    expect(result).toMatchObject({
      type: "error",
      error: "table does not exist [table=sys.telemetry_wal]",
      dataset: [],
    })
    expect(transport).toHaveBeenCalledOnce()
  })
})
