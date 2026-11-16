import { describe, expect, it } from "vitest"
import {
  buildMonitoringDashboard,
  isUnmodifiedMonitoring,
  monitoringFingerprint,
  monitoringWindowMinutes,
} from "./dashboard"
import { makeBuffer } from "../../store/buffers"
import { isHighlightConfig } from "../../components/ResultGrid/highlight/isHighlightConfig"

const build = (kind: "table" | "matview" = "table", history = true) =>
  buildMonitoringDashboard({
    name: "trades",
    kind,
    telemetryEnabled: history,
    walEnabled: true,
  })

describe("monitoring templates", () => {
  it.each([
    ["MINUTE", 1, 30],
    ["MINUTE", 10, 60],
    ["HOUR", 1, 360],
    ["DAY", 1, 8640],
    ["WEEK", 1, 10080],
    ["MONTH", 1, 10080],
    ["YEAR", 1, 10080],
    [null, 0, 30],
  ])(
    "shows several timer refreshes for %s %s while bounding the initial window",
    (unit, interval, expected) => {
      expect(
        monitoringWindowMinutes({
          refresh_type: "timer",
          timer_interval: interval,
          timer_interval_unit: unit,
        }),
      ).toBe(expected)
    },
  )

  it("uses the actual refresh cadence, not the view's aggregation period", () => {
    const view = buildMonitoringDashboard({
      name: "fx_trades_ohlc_1d",
      kind: "matview",
      telemetryEnabled: true,
      walEnabled: true,
      refreshSchedule: {
        refresh_type: "timer",
        timer_interval: 1,
        timer_interval_unit: "HOUR",
      },
    })
    expect(
      view.settings?.variables?.find((v) => v.name === "window_minutes")?.value,
    ).toBe("360")
    expect(
      monitoringWindowMinutes({
        refresh_type: "immediate",
        timer_interval: 1,
        timer_interval_unit: "HOUR",
      }),
    ).toBe(30)
  })
  it.each(["table", "matview"] as const)(
    "binds %s SQL safely without a target variable",
    (kind) => {
      const view = buildMonitoringDashboard({
        name: "my' table`",
        kind,
        telemetryEnabled: true,
        walEnabled: true,
      })
      expect(view.settings?.variables?.map((v) => v.name)).toEqual([
        "window_minutes",
        "incident_hours",
      ])
      for (const cell of view.cells.filter((c) => c.type !== "markdown")) {
        expect(cell.value).toContain("'my'' table`'")
        expect(cell.value).not.toMatch(/__TARGET|@target_name|market_data/)
        if (cell.highlightConfig)
          expect(isHighlightConfig(cell.highlightConfig)).toBe(true)
      }
    },
  )

  it.each(["table", "matview"] as const)(
    "keeps the %s panels aligned with no overlapping rows",
    (kind) => {
      const view = build(kind)
      const layout = view.settings!.layout!
      for (const item of layout) {
        const neighbors = layout.filter((other) => other.y === item.y)
        expect(neighbors.every((other) => other.h === item.h)).toBe(true)
        for (const other of layout.filter((other) => other.y > item.y))
          expect(other.y).toBeGreaterThanOrEqual(item.y + item.h)
      }
      const charts = view.cells.filter((c) => c.chartConfig)
      expect(charts).toHaveLength(kind === "table" ? 7 : 5)
      expect(
        charts
          .flatMap((c) => c.chartConfig!.queries)
          .every((q) => q?.type !== "scatter"),
      ).toBe(true)
      for (const cell of charts.filter((c) =>
        c.value.includes("approx_percentile"),
      ))
        for (const percentile of ["0.5", "0.9", "0.95", "0.99"])
          expect(cell.value).toContain(percentile)
      if (kind === "table")
        expect(charts.some((c) => c.value.includes("telemetry_mat_view"))).toBe(
          false,
        )
    },
  )

  it.each(["table", "matview"] as const)(
    "builds %s without telemetry queries when history is unavailable",
    (kind) => {
      const view = build(kind, false)
      expect(view.settings?.variables).toEqual([])
      expect(view.cells.some((c) => c.value.includes("sys.telemetry"))).toBe(
        false,
      )
      expect(view.cells.some((c) => c.value.includes("table_partitions"))).toBe(
        true,
      )
      expect(
        view.cells.some((c) => c.value.includes("require enabled telemetry")),
      ).toBe(true)
    },
  )

  it("handles a non-WAL table with live storage instead of WAL history", () => {
    const view = buildMonitoringDashboard({
      name: "static",
      kind: "table",
      telemetryEnabled: true,
      walEnabled: false,
    })
    expect(view.cells.some((c) => c.value.includes("sys.telemetry"))).toBe(
      false,
    )
    expect(
      view.cells.find((c) => c.name === "Live table health")?.value,
    ).toContain("'Disabled'")
  })

  it("recognizes user customization while ignoring query results and inspection", () => {
    const view = build()
    const buffer = makeBuffer({
      label: "trades · monitoring",
      position: 0,
      notebookViewState: view,
      monitoring: {
        target: { instanceKey: "db", tableId: 1, kind: "table" },
        templateVersion: 1,
        initialFingerprint: monitoringFingerprint("trades · monitoring", view),
      },
    })
    expect(isUnmodifiedMonitoring(buffer)).toBe(true)
    const inspected = structuredClone(view)
    inspected.focusedCellId = inspected.cells[1].id
    inspected.cells[1].lastRunStatus = "success"
    inspected.cells[1].paneView = "editor_result"
    expect(isUnmodifiedMonitoring(buffer, inspected)).toBe(true)
    inspected.cells[1].value += " limit 5"
    expect(isUnmodifiedMonitoring(buffer, inspected)).toBe(false)
    expect(isUnmodifiedMonitoring({ ...buffer, label: "My dashboard" })).toBe(
      false,
    )
    const configured = structuredClone(view)
    configured.settings!.variables![0].value = "60"
    expect(isUnmodifiedMonitoring(buffer, configured)).toBe(false)
    const resized = structuredClone(view)
    resized.cells[2].bottomHeight = 500
    expect(isUnmodifiedMonitoring(buffer, resized)).toBe(false)
  })
})
