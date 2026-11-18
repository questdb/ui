import { createCell, type NotebookViewState } from "../../store/notebook"
import { computeAgentCellGridH } from "../../scenes/Editor/Notebook/cellSizing"
import { tableTemplate } from "./tableTemplate"
import { matviewTemplate } from "./matviewTemplate"
import type {
  MonitoringKind,
  MonitoringTarget,
  MonitoringRefreshSchedule,
} from "./types"

// Show several refreshes for timer-based views rather than a rolling window
// that is empty for most of each interval. Bound the initial scan to a week;
// the user can still choose a different window in Variables.
export const monitoringWindowMinutes = (
  schedule?: MonitoringRefreshSchedule,
): number => {
  const minutesPerUnit: Record<string, number> = {
    MINUTE: 1,
    HOUR: 60,
    DAY: 1440,
    WEEK: 10080,
  }
  if (schedule?.refresh_type !== "timer") return 30
  if (!Number.isFinite(schedule.timer_interval) || schedule.timer_interval <= 0)
    return 30
  // Calendar months/years already exceed the initial scan limit.
  if (["MONTH", "YEAR"].includes(schedule.timer_interval_unit ?? ""))
    return 10080
  const minutes =
    schedule.timer_interval *
    (minutesPerUnit[schedule.timer_interval_unit ?? ""] ?? 0)
  return Number.isFinite(minutes) && minutes > 0
    ? Math.max(30, Math.min(10080, Math.ceil(minutes * 6)))
    : 30
}

export const MONITORING_TEMPLATE_VERSION = 1

// QuestDB table names are case-insensitive.
export const monitoringTargetKey = (target: MonitoringTarget): string =>
  JSON.stringify([target.instanceKey, target.kind, target.name.toLowerCase()])

export { monitoringFingerprint, isUnmodifiedMonitoring } from "./fingerprint"

// Monitoring dashboards exist only for WAL tables and materialized views
// (always WAL): their history comes from WAL telemetry.
export const buildMonitoringDashboard = ({
  name,
  kind,
  telemetryEnabled,
  refreshSchedule,
}: {
  name: string
  kind: MonitoringKind
  telemetryEnabled: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}): NotebookViewState => {
  const templates = (
    kind === "matview" ? matviewTemplate() : tableTemplate()
  ).filter((cell) => telemetryEnabled || !cell.telemetry)
  // Only a view's refresh charts and incidents need enabled telemetry.
  const refreshHistory = kind === "table" || telemetryEnabled
  const sqlName = `'${name.replace(/'/g, "''")}'`
  const markdownName = name.replace(/[\\`*_{}[\]<>#|]/g, "\\$&")
  const cells = templates.map((template, position) => {
    // Function replacers: a string replacement would expand `$'`, `$$` and
    // `$&` in names such as `orders$` into unrelated SQL.
    let value = template.value
      .replaceAll("__TARGET_SQL__", () => sqlName)
      .replaceAll("__TARGET_NAME__", () => markdownName)
    if (!refreshHistory && template.name === "Reading the data") {
      value = `### Reading the data
Charts use completed 1-minute buckets from WAL telemetry, which the server keeps for one week. Rate charts show 0 for idle minutes, and an empty chart means nothing happened in its window. Refresh charts and incidents are hidden because telemetry is disabled. **Refresh age** is the time since the last refresh finished, whether it succeeded or failed.`
    }
    if (!refreshHistory && position === 0) {
      value = `# Materialized view monitoring · ${markdownName}
Live health, output and storage. You can change the chart window (**window_minutes**) in **Variables**.`
    }
    return {
      ...createCell(position, value),
      name: template.name,
      type: template.type,
      topHeight: template.type === "markdown" ? template.height : 176,
      topResized: true,
      ...(template.type === "markdown"
        ? {}
        : {
            bottomHeight: template.height,
            bottomResized: true,
            paneView: "result" as const,
            autoRefresh: template.autoRefresh,
            highlightConfig: template.highlightConfig,
          }),
      ...(template.chartConfig
        ? {
            mode: "draw" as const,
            chartConfig: template.chartConfig,
          }
        : {}),
    }
  })
  let y = 0
  const layout = [...new Set(templates.map((cell) => cell.row))].flatMap(
    (row) => {
      const items = templates.flatMap((template, index) =>
        template.row === row
          ? [
              {
                i: cells[index].id,
                x: template.x,
                y,
                w: template.w,
                h: computeAgentCellGridH(
                  cells[index],
                  template.type !== "markdown",
                ),
              },
            ]
          : [],
      )
      y += Math.max(...items.map((item) => item.h))
      return items
    },
  )
  return {
    cells,
    settings: {
      layoutMode: "grid",
      layout,
      autoRefreshDefault: "1s",
      variables: [
        {
          name: "window_minutes",
          value: String(
            monitoringWindowMinutes(
              kind === "matview" ? refreshSchedule : undefined,
            ),
          ),
        },
        // Only views keep a per-target incident log (refresh failures).
        ...(kind === "matview" && telemetryEnabled
          ? [{ name: "incident_hours", value: "24" }]
          : []),
      ],
    },
  }
}
