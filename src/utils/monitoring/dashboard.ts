import { createCell, type NotebookViewState } from "../../store/notebook"
import { computeAgentCellGridH } from "../../scenes/Editor/Notebook/cellSizing"
import { NOTEBOOK_ROW_CAP } from "../../scenes/Editor/Notebook/notebookUtils"
import { tableTemplate } from "./tableTemplate"
import { matviewTemplate } from "./matviewTemplate"
import type {
  MonitoringKind,
  MonitoringRefreshSchedule,
  MonitoringTemplateValues,
} from "./types"

// A notebook fetches at most NOTEBOOK_ROW_CAP rows, oldest first, so a chart
// with more buckets than that would silently lose its newest ones. Every chart
// clamps the window to the buckets it can hold: 1-minute charts to
// NOTEBOOK_ROW_CAP minutes, 5-second charts to NOTEBOOK_ROW_CAP / 12 minutes.
export const MONITORING_MAX_WINDOW_MINUTES = NOTEBOOK_ROW_CAP
export const MONITORING_MAX_5S_WINDOW_MINUTES = Math.floor(
  NOTEBOOK_ROW_CAP / 12,
)

const clampedWindow = (maxMinutes: number) =>
  `least(@window_minutes,${maxMinutes})`

// Show several refreshes for timer-based views rather than a rolling window
// that is empty for most of each interval. Bound the initial scan to what a
// 1-minute chart can hold; the user can still choose a different window in
// Variables.
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
    return MONITORING_MAX_WINDOW_MINUTES
  const minutes =
    schedule.timer_interval *
    (minutesPerUnit[schedule.timer_interval_unit ?? ""] ?? 0)
  return Number.isFinite(minutes) && minutes > 0
    ? Math.max(
        30,
        Math.min(MONITORING_MAX_WINDOW_MINUTES, Math.ceil(minutes * 6)),
      )
    : 30
}

// A fence longer than any backtick run in the text, padded when the text
// starts or ends with a backtick (CommonMark strips one space on each side).
const markdownCodeSpan = (text: string): string => {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  )
  const fence = "`".repeat(longestRun + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}

export {
  MONITORING_TEMPLATE_VERSION,
  monitoringTargetKey,
  monitoringTemplateId,
} from "./identity"

// Monitoring dashboards exist only for WAL tables and materialized views
// (always WAL): their history comes from WAL telemetry.
export const buildMonitoringDashboard = ({
  name,
  kind,
  telemetryEnabled,
  telemetryUnknown = false,
  refreshSchedule,
}: {
  name: string
  kind: MonitoringKind
  telemetryEnabled: boolean
  // The server's telemetry setting could not be read: telemetry panels are
  // left out, and the dashboard says why without claiming it is disabled.
  telemetryUnknown?: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}): NotebookViewState => {
  const values: MonitoringTemplateValues = {
    targetSql: `'${name.replace(/'/g, "''")}'`,
    // The name is shown as a code span: its text renders literally, and GFM
    // autolinking, which runs on decoded text and so ignores backslash
    // escapes and entities, leaves names such as `www.example.com` or
    // `ops@example.com` alone.
    targetName: markdownCodeSpan(name),
    window1m: clampedWindow(MONITORING_MAX_WINDOW_MINUTES),
    window5s: clampedWindow(MONITORING_MAX_5S_WINDOW_MINUTES),
  }
  const templates = (
    kind === "matview" ? matviewTemplate(values) : tableTemplate(values)
  ).filter((cell) => telemetryEnabled || !cell.telemetry)
  // Only a view's refresh charts and incidents need enabled telemetry.
  const refreshHistory = kind === "table" || telemetryEnabled
  const hiddenReason = telemetryUnknown
    ? "the server's telemetry setting could not be read"
    : "telemetry is disabled"
  const cells = templates.map((template, position) => {
    let value = template.value
    if (!refreshHistory && template.name === "Reading the data") {
      value = `### Reading the data
Charts use completed 1-minute buckets from WAL telemetry, which the server keeps for one week. Rate charts show 0 for idle minutes, and an empty chart means nothing happened in its window. A chart holds at most 10,000 buckets, so charts cover at most the latest 10,000 minutes of **window_minutes**. Refresh charts and incidents are hidden because ${hiddenReason}. **Refresh age** is the time since the last refresh finished, whether it succeeded or failed.`
    }
    if (!refreshHistory && position === 0) {
      value = `# Materialized view monitoring · ${values.targetName}
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
