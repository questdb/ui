import { describe, expect, it } from "vitest"
import {
  buildMonitoringDashboard,
  MONITORING_MAX_WINDOW_MINUTES,
  monitoringWindowMinutes,
} from "./dashboard"
import { monitoringTemplateId } from "./identity"
import { examplePersonalizationReason } from "../examples/examplePersonalization"
import { NOTEBOOK_ROW_CAP } from "../../scenes/Editor/Notebook/notebookUtils"
import { makeBuffer } from "../../store/buffers"
import type { NotebookViewState } from "../../store/notebook"
import { isHighlightConfig } from "../../components/ResultGrid/highlight/isHighlightConfig"

const build = (kind: "table" | "matview" = "table", history = true) =>
  buildMonitoringDashboard({
    name: "trades",
    kind,
    telemetryEnabled: history,
  })

describe("monitoring templates", () => {
  it.each([
    ["MINUTE", 1, 30],
    ["MINUTE", 10, 60],
    ["HOUR", 1, 360],
    ["DAY", 1, 8640],
    ["WEEK", 1, 10000],
    ["MONTH", 1, 10000],
    ["YEAR", 1, 10000],
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
      })
      expect(view.settings?.variables?.map((v) => v.name)).toEqual(
        kind === "matview"
          ? ["window_minutes", "incident_hours"]
          : ["window_minutes"],
      )
      for (const cell of view.cells.filter((c) => c.type !== "markdown")) {
        expect(cell.value).toContain("'my'' table`'")
        expect(cell.value).not.toMatch(/__TARGET|@target_name|market_data/)
        if (cell.highlightConfig)
          expect(isHighlightConfig(cell.highlightConfig)).toBe(true)
      }
    },
  )

  it.each([
    ["table", "a__WINDOW_5S__"],
    ["table", "a__WINDOW_1M__"],
    ["table", "x__TARGET_NAME__"],
    ["matview", "a__WINDOW_1M__"],
    ["matview", "x__TARGET_SQL__"],
  ] as const)(
    "keeps the %s name %s verbatim when it looks like template text",
    (kind, name) => {
      const view = buildMonitoringDashboard({
        name,
        kind,
        telemetryEnabled: true,
      })
      const sql = view.cells.filter((c) => c.type !== "markdown")
      expect(sql.some((cell) => cell.value.includes(`'${name}'`))).toBe(true)
      for (const cell of sql) {
        const literals =
          cell.value.match(/(?:table_name|view_name)\s*=\s*'[^']*'/g) ?? []
        literals.forEach((literal) => expect(literal).toContain(`'${name}'`))
      }
      expect(view.cells[0].value).toContain(` · \`${name}\`\n`)
    },
  )

  it.each([
    ["table", "orders$"],
    ["table", "a$$b"],
    ["matview", "a$&b"],
    ["matview", "x$`y"],
  ] as const)(
    "binds the %s name %s literally, without replacement patterns",
    (kind, name) => {
      const view = buildMonitoringDashboard({
        name,
        kind,
        telemetryEnabled: true,
      })
      for (const cell of view.cells.filter((c) => c.type !== "markdown")) {
        expect(cell.value).toContain(`'${name}'`)
        expect(cell.value).not.toContain("__TARGET")
      }
      // The title shows the name as a code span, with a longer fence when
      // the name holds a backtick.
      expect(view.cells[0].value).toContain(
        name.includes("`") ? ` · \`\`${name}\`\`\n` : ` · \`${name}\`\n`,
      )
    },
  )

  // A notebook fetches at most NOTEBOOK_ROW_CAP rows, oldest first: a chart
  // with more buckets would silently drop its newest ones.
  it.each([
    ["table", undefined],
    ["matview", undefined],
    ["matview", "WEEK"],
  ] as const)(
    "keeps every %s chart within the notebook row cap (timer %s)",
    (kind, unit) => {
      const view = buildMonitoringDashboard({
        name: "trades",
        kind,
        telemetryEnabled: true,
        refreshSchedule: unit
          ? {
              refresh_type: "timer",
              timer_interval: 1,
              timer_interval_unit: unit,
            }
          : undefined,
      })
      const window = Number(
        view.settings?.variables?.find((v) => v.name === "window_minutes")
          ?.value,
      )
      expect(window).toBeLessThanOrEqual(MONITORING_MAX_WINDOW_MINUTES)
      const charts = view.cells.filter((c) => c.value.includes("SAMPLE BY"))
      expect(charts.length).toBeGreaterThan(0)
      for (const cell of charts) {
        expect(cell.value, cell.name).not.toMatch(/-\s*@window_minutes/)
        const bucketsPerMinute = cell.value.includes("SAMPLE BY 5s") ? 12 : 1
        const caps = [
          ...cell.value.matchAll(/least\(@window_minutes,(\d+)\)/g),
        ].map((match) => Number(match[1]))
        expect(caps.length, cell.name).toBeGreaterThan(0)
        for (const cap of caps)
          expect(cap * bucketsPerMinute, cell.name).toBeLessThanOrEqual(
            NOTEBOOK_ROW_CAP,
          )
      }
    },
  )

  it("says why telemetry panels are hidden when the setting is unknown", () => {
    const view = buildMonitoringDashboard({
      name: "trades",
      kind: "matview",
      telemetryEnabled: false,
      telemetryUnknown: true,
    })
    const reading = view.cells.find((c) => c.name === "Reading the data")?.value
    expect(reading).toContain(
      "hidden because the server's telemetry setting could not be read",
    )
    expect(reading).not.toContain("telemetry is disabled")
  })

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

  it("keeps a table's WAL history when telemetry is disabled", () => {
    // sys.telemetry_wal is recorded whatever the telemetry setting.
    const view = build("table", false)
    expect(view.settings?.variables?.map((v) => v.name)).toEqual([
      "window_minutes",
    ])
    expect(view.cells.map((c) => c.value).join("\n")).toContain(
      "sys.telemetry_wal",
    )
    expect(view.cells.map((c) => c.name)).toEqual(
      build("table", true).cells.map((c) => c.name),
    )
  })

  it("hides only a view's refresh history when telemetry is disabled", () => {
    const view = build("matview", false)
    const sql = view.cells.map((c) => c.value).join("\n")
    expect(view.settings?.variables?.map((v) => v.name)).toEqual([
      "window_minutes",
    ])
    expect(sql).not.toContain("telemetry_mat_view")
    expect(sql).not.toContain("@incident_hours")
    // Output charts read WAL telemetry and stay.
    expect(view.cells.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "View output · rows/s",
        "View write amplification",
      ]),
    )
    expect(view.cells.map((c) => c.name)).not.toContain("Refresh incidents")
    expect(view.cells[0].value).not.toContain("incident_hours")
    expect(
      view.cells.find((c) => c.name === "Reading the data")?.value,
    ).toContain("hidden because telemetry is disabled")
  })
})

describe("monitoring dashboard customization", () => {
  // Closing a dashboard that still has its template deletes it for good, so
  // every authored edit of a generated dashboard must detach it.
  type Edit = (view: NotebookViewState) => void
  const chart = (view: NotebookViewState) =>
    view.cells.find((cell) => cell.mode === "draw")!
  const grid = (view: NotebookViewState) =>
    view.cells.find((cell) => cell.highlightConfig)!
  const layoutOf = (view: NotebookViewState) => view.settings!.layout!

  const authored: Array<[string, Edit]> = [
    ["cell SQL", (v) => (grid(v).value += " limit 5")],
    ["cell name", (v) => (grid(v).name = "Renamed")],
    ["cell type", (v) => (grid(v).type = "markdown")],
    ["chart mode", (v) => (grid(v).mode = "draw")],
    ["chart config", (v) => (chart(v).chartConfig!.xColumn = "other")],
    ["highlight rules", (v) => (grid(v).highlightConfig = undefined)],
    ["cell auto-refresh", (v) => (grid(v).autoRefresh = "30s")],
    [
      "a resized editor",
      (v) => {
        grid(v).topResized = true
        grid(v).topHeight = 333
      },
    ],
    [
      "a resized result",
      (v) => {
        grid(v).bottomResized = true
        grid(v).bottomHeight = 444
      },
    ],
    ["variables", (v) => (v.settings!.variables![0].value = "60")],
    ["notebook auto-refresh", (v) => (v.settings!.autoRefreshDefault = "30s")],
    ["layout mode", (v) => (v.settings!.layoutMode = "list")],
    ["a panel's column", (v) => (layoutOf(v)[0].x += 1)],
    ["a panel's width", (v) => (layoutOf(v)[0].w -= 1)],
    [
      "a panel's row",
      (v) => (layoutOf(v)[0].y = Math.max(...layoutOf(v).map((i) => i.y)) + 1),
    ],
    ["a removed cell", (v) => v.cells.pop()],
    ["cell order", (v) => v.cells.reverse()],
  ]

  const unauthored: Array<[string, Edit]> = [
    ["focus", (v) => (v.focusedCellId = v.cells[1].id)],
    ["run status", (v) => (grid(v).lastRunStatus = "success")],
    ["pane inspection", (v) => (grid(v).paneView = "editor_result")],
    ["automatic panel height", (v) => (layoutOf(v)[0].h += 3)],
    ["layout compaction", (v) => layoutOf(v).forEach((item) => (item.y *= 2))],
  ]

  const template = build()
  const buffer = makeBuffer({
    label: "trades · monitoring",
    position: 0,
    notebookViewState: template,
    templateId: monitoringTemplateId("table"),
    monitoring: {
      target: { kind: "table", name: "trades" },
    },
  })
  const customizes = (edit: Edit) => {
    const view = structuredClone(template)
    edit(view)
    return examplePersonalizationReason(buffer, { notebookViewState: view })
  }

  it.each(authored)("counts %s as customization", (_name, edit) => {
    expect(customizes(edit)).toBe("content")
  })

  it.each(unauthored)("ignores %s", (_name, edit) => {
    expect(customizes(edit)).toBeUndefined()
  })

  it("counts a rename as customization", () => {
    expect(examplePersonalizationReason(buffer, { label: "Mine" })).toBe(
      "rename",
    )
  })
})
