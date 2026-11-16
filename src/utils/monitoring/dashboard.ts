import { createCell, type NotebookViewState } from "../../store/notebook"
import { computeAgentCellGridH } from "../../scenes/Editor/Notebook/cellSizing"
import { tableTemplate } from "./tableTemplate"
import { matviewTemplate } from "./matviewTemplate"
import { healthHighlights } from "./highlights"
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

export const monitoringTargetKey = (target: MonitoringTarget): string =>
  JSON.stringify([target.instanceKey, target.kind, target.tableId])

export { monitoringFingerprint, isUnmodifiedMonitoring } from "./fingerprint"

export const buildMonitoringDashboard = ({
  name,
  kind,
  telemetryEnabled,
  walEnabled,
  refreshSchedule,
}: {
  name: string
  kind: MonitoringKind
  telemetryEnabled: boolean
  walEnabled: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}): NotebookViewState => {
  const history = telemetryEnabled && walEnabled
  const templates = (
    kind === "matview" ? matviewTemplate() : tableTemplate()
  ).filter((cell) => history || !cell.history)
  const sqlName = `'${name.replace(/'/g, "''")}'`
  const markdownName = name.replace(/[\\`*_{}[\]<>#|]/g, "\\$&")
  const cells = templates.map((template, position) => {
    let highlightConfig = template.highlightConfig
    let value = template.value
      .replaceAll("__TARGET_SQL__", sqlName)
      .replaceAll("__TARGET_NAME__", markdownName)
    if (!history && template.name === "Reading the data") {
      value =
        "### Current state\nThis dashboard shows live health and partition storage. Historical charts and incident history require enabled telemetry and a WAL table. Polling does not store history."
    }
    if (!history && position === 0) {
      value = `# ${kind === "matview" ? "Materialized view" : "Table"} monitoring · ${markdownName}\nLive health and partition storage for this ${kind === "matview" ? "view" : "table"}.`
    }
    if (!walEnabled && template.name === "Live table health") {
      value = `SELECT table_name AS "Table", table_row_count AS "Rows", 'Disabled' AS "WAL status", CAST((now()-table_last_write_timestamp)/1000000.0 AS DECIMAL(16,3)) AS "Write age (s)" FROM tables() WHERE table_name=${sqlName}`
      highlightConfig = healthHighlights("Table", ["WAL status"], ["Rows"])
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
            highlightConfig,
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
      variables: history
        ? [
            {
              name: "window_minutes",
              value: String(
                monitoringWindowMinutes(
                  kind === "matview" ? refreshSchedule : undefined,
                ),
              ),
            },
            { name: "incident_hours", value: "24" },
          ]
        : [],
    },
  }
}
