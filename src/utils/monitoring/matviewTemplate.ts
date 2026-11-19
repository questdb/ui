import type { MonitoringCellTemplate, MonitoringTemplateValues } from "./types"
import {
  healthHighlights,
  partitionHighlights,
  incidentHighlights,
} from "./highlights"

// Reviewed monitoring layout: preserve paired pane heights when adding panels.
export const matviewTemplate = ({
  targetSql,
  targetName,
  window1m,
  maxBuckets,
  hiddenRefreshReason,
}: MonitoringTemplateValues): MonitoringCellTemplate[] => [
  {
    name: "Live view monitoring",
    type: "markdown",
    row: 0,
    x: 0,
    w: 12,
    height: 86,
    value: hiddenRefreshReason
      ? `# Materialized view monitoring · ${targetName}
Live health, output and storage. You can change the chart window (**window_minutes**) in **Variables**.`
      : `# Materialized view monitoring · ${targetName}
Live health, refresh behavior, output and storage. You can change the chart window (**window_minutes**) and the incident window (**incident_hours**) in **Variables**.`,
  },
  {
    name: "Live view health",
    row: 5,
    x: 0,
    w: 12,
    height: 176,
    autoRefresh: "1s",
    value: `SELECT v.view_name AS "View",v.view_status AS "Status",v.base_table_name AS "Base table",
 CASE WHEN b.table_name IS NULL THEN 'Unknown' WHEN b.table_suspended THEN 'Suspended' ELSE 'Running' END AS "Base status",
 t.table_row_count AS "Rows",
 CASE WHEN v.base_table_txn IS NULL OR v.refresh_base_table_txn IS NULL THEN NULL
 WHEN v.base_table_txn>v.refresh_base_table_txn THEN v.base_table_txn-v.refresh_base_table_txn ELSE 0 END AS "Pending base txns",
 CAST((now()-v.last_refresh_finish_timestamp)/1000000.0 AS DECIMAL(16,3)) AS "Refresh age (s)",
 v.invalidation_reason AS "Reason"
FROM materialized_views() v JOIN tables() t ON v.view_name=t.table_name
LEFT JOIN tables() b ON v.base_table_name=b.table_name WHERE v.view_name=${targetSql}`,
    highlightConfig: healthHighlights(
      "View",
      ["Status", "Base status"],
      ["Rows", "Pending base txns"],
    ),
  },
  {
    name: "Refresh context",
    type: "markdown",
    row: 10,
    x: 0,
    w: 12,
    height: 86,
    telemetry: true,
    value: `### Read refreshes in context
Duration only includes successful refreshes, so read it together with the failed refreshes next to it and the schedule below. **Refresh age** is the time since the last refresh finished, whether it succeeded or failed. It doesn't tell you how fresh the data is. **Pending base txns** grows between runs of timer and manual views.`,
  },
  {
    name: "Refresh duration · ms",
    row: 13,
    x: 0,
    w: 6,
    height: 356,
    telemetry: true,
    autoRefresh: "60s",
    value: `SELECT e.created, approx_percentile(e.latency, 0.5) AS "p50 ms",
       approx_percentile(e.latency, 0.9) AS "p90 ms",
       approx_percentile(e.latency, 0.95) AS "p95 ms",
       approx_percentile(e.latency, 0.99) AS "p99 ms"
FROM 'sys.telemetry_mat_view' e JOIN tables() t ON e.view_table_id=t.id
WHERE e.created>=dateadd('m',-${window1m},timestamp_floor('m',now())) AND e.created<timestamp_floor('m',now()) AND t.table_name=${targetSql} AND e.event=204
SAMPLE BY 1m ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: ["p50 ms", "p90 ms", "p95 ms", "p99 ms"],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "Refreshes per minute",
    row: 13,
    x: 6,
    w: 6,
    height: 356,
    telemetry: true,
    autoRefresh: "60s",
    value: `SELECT e.created, sum(CASE WHEN e.event=204 THEN 1 ELSE 0 END) AS "Successful", sum(CASE WHEN e.event=203 THEN 1 ELSE 0 END) AS "Failed"
FROM 'sys.telemetry_mat_view' e JOIN tables() t ON e.view_table_id=t.id
WHERE e.created>=dateadd('m',-${window1m},timestamp_floor('m',now())) AND e.created<timestamp_floor('m',now()) AND t.table_name=${targetSql} AND e.event IN (203,204)
SAMPLE BY 1m FROM dateadd('m',-${window1m},timestamp_floor('m',now())) TO timestamp_floor('m',now()) FILL(0,0)`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "stackedBar",
          yColumns: ["Successful", "Failed"],
          axis: "right",
        },
      ],
      rightAxis: {
        min: 0,
        name: "Refreshes/min",
      },
    },
  },
  {
    name: "Refresh setup & WAL health",
    row: 32,
    x: 0,
    w: 12,
    height: 176,
    autoRefresh: "2s",
    value: `SELECT v.view_name AS "View",v.refresh_type AS "Refresh type",
 CASE WHEN v.refresh_type='timer' THEN concat(CAST(v.timer_interval AS STRING),' ',v.timer_interval_unit)
 WHEN v.refresh_type='immediate' THEN 'On changes' ELSE v.refresh_type END AS "Schedule",
 t.partitionBy AS "Partitioning",
 CASE WHEN t.ttlValue=0 THEN 'None' ELSE concat(CAST(t.ttlValue AS STRING),' ',t.ttlUnit) END AS "TTL",
 CASE WHEN t.table_suspended THEN 'Suspended' ELSE 'Running' END AS "WAL status",
 t.wal_pending_row_count AS "Pending WAL rows",
 CASE t.table_memory_pressure_level WHEN 0 THEN 'None' WHEN 1 THEN 'Reduced parallelism' WHEN 2 THEN 'Backoff' ELSE 'Unknown' END AS "Memory pressure",
 nullif(w.errorMessage,'') AS "Suspend reason"
FROM materialized_views() v JOIN tables() t ON v.view_name=t.table_name
LEFT JOIN wal_tables() w ON w.name=t.table_name WHERE v.view_name=${targetSql}`,
    highlightConfig: healthHighlights(
      "View",
      ["WAL status", "Memory pressure"],
      ["Pending WAL rows"],
    ),
  },
  {
    name: "View output · rows/s",
    row: 40,
    x: 0,
    w: 6,
    height: 356,
    autoRefresh: "60s",
    value: `SELECT w.created,
 sum(w.rowCount)/60.0 AS "Logical rows/s",
 sum(w.physicalRowCount)/60.0 AS "Physical rows/s"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created >= dateadd('m', -${window1m}, timestamp_floor('m', now()))
 AND w.created < timestamp_floor('m', now())
 AND t.table_name = ${targetSql} AND w.event=105 AND w.rowCount>0
SAMPLE BY 1m FROM dateadd('m', -${window1m}, timestamp_floor('m', now())) TO timestamp_floor('m', now()) FILL(0,0)`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: ["Logical rows/s", "Physical rows/s"],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "View write amplification",
    row: 40,
    x: 6,
    w: 6,
    height: 356,
    autoRefresh: "60s",
    value: `SELECT w.created,
 sum(w.physicalRowCount)*1.0/nullif(sum(w.rowCount),0) AS "Physical / logical rows"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created >= dateadd('m', -${window1m}, timestamp_floor('m', now()))
 AND w.created < timestamp_floor('m', now())
 AND t.table_name = ${targetSql} AND w.event=105 AND w.rowCount>0
SAMPLE BY 1m ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: ["Physical / logical rows"],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "View storage",
    type: "markdown",
    row: 54,
    x: 0,
    w: 12,
    height: 86,
    value: `### View storage
The footprint shows the current size, not growth over time. The grid lists active and newest partitions first and marks changes. Refreshes rewrite time ranges, so **Dead rows** (replaced rows still on disk) and **Pieces** (files per partition) can build up.`,
  },
  {
    name: "Partition footprint · MiB",
    row: 59,
    x: 0,
    w: 6,
    height: 386,
    autoRefresh: "15s",
    value: `WITH pieces AS (
 SELECT CASE t.partitionBy
  WHEN 'HOUR' THEN to_str(timestamp_floor('h', cast(p.minTimestamp AS TIMESTAMP)), 'yyyy-MM-dd HH:mm')
  WHEN 'DAY' THEN to_str(timestamp_floor('d', cast(p.minTimestamp AS TIMESTAMP)), 'yyyy-MM-dd')
  WHEN 'WEEK' THEN to_str(timestamp_floor('w', cast(p.minTimestamp AS TIMESTAMP)), 'yyyy-MM-dd')
  WHEN 'MONTH' THEN to_str(timestamp_floor('M', cast(p.minTimestamp AS TIMESTAMP)), 'yyyy-MM')
  WHEN 'YEAR' THEN to_str(timestamp_floor('y', cast(p.minTimestamp AS TIMESTAMP)), 'yyyy')
  WHEN 'NONE' THEN 'Unpartitioned'
  ELSE p.name END AS logical_partition, p.diskSize AS disk_size
 FROM table_partitions(${targetSql}) p CROSS JOIN tables() t
 WHERE p.attached AND t.table_name=${targetSql}
)
SELECT logical_partition AS "Partition", sum(disk_size)/1048576.0 AS "Disk MiB"
FROM pieces GROUP BY logical_partition ORDER BY logical_partition`,
    chartConfig: {
      xColumn: "Partition",
      queries: [
        {
          type: "bar",
          yColumns: ["Disk MiB"],
          axis: "right",
        },
      ],
      rightAxis: {
        min: 0,
        name: "MiB",
      },
    },
  },
  {
    name: "Live partitions",
    row: 59,
    x: 6,
    w: 6,
    height: 386,
    autoRefresh: "5s",
    value: `SELECT name AS "Partition",
 cast(diskSize/1048576.0 AS DECIMAL(16,3)) AS "Disk MiB",
 numRows AS "Rows",
 CASE WHEN active THEN 'Active' ELSE 'Historical' END AS "State",
 deadRows AS "Dead rows",
 pieceCount AS "Pieces"
FROM table_partitions(${targetSql})
WHERE attached ORDER BY active DESC, minTimestamp DESC`,
    highlightConfig: partitionHighlights("Disk MiB"),
  },
  {
    name: "Refresh incidents",
    type: "markdown",
    row: 74,
    x: 0,
    w: 12,
    height: 86,
    telemetry: true,
    value: `### What happened before the current state?
Both grids cover the last **incident_hours** hours, and the log shows up to 100 of the latest refresh failures and invalidations. When a refresh fails on a valid view, the view is also invalidated, so one failure shows up twice. A WAL suspension shows up live, with its reason, in **Refresh setup & WAL health**.`,
  },
  {
    name: "Incident counts",
    row: 79,
    x: 0,
    w: 6,
    height: 356,
    telemetry: true,
    autoRefresh: "60s",
    value: `WITH history AS (SELECT e.created AS observed_at, CASE WHEN e.event=202 THEN 'View invalidated' ELSE 'Refresh failed' END AS event_name, e.invalidation_reason AS detail FROM 'sys.telemetry_mat_view' e JOIN tables() t ON e.view_table_id=t.id WHERE e.created>=dateadd('h',-@incident_hours,now()) AND t.table_name=${targetSql} AND e.event IN (202,203))
SELECT k.event_name AS "Event", coalesce(h.events,0) AS "Count",
 CASE WHEN coalesce(h.events,0)=0 THEN 'None recorded' ELSE 'Review' END AS "Signal", h.last_seen AS "Last seen (UTC)"
FROM (SELECT 'View invalidated' AS event_name UNION ALL SELECT 'Refresh failed') k
LEFT JOIN (SELECT event_name,count() AS events,max(observed_at) AS last_seen FROM history GROUP BY event_name) h ON k.event_name=h.event_name`,
    highlightConfig: incidentHighlights(true),
  },
  {
    name: "Recent incidents",
    row: 79,
    x: 6,
    w: 6,
    height: 356,
    telemetry: true,
    autoRefresh: "60s",
    value: `WITH history AS (SELECT e.created AS observed_at, CASE WHEN e.event=202 THEN 'View invalidated' ELSE 'Refresh failed' END AS event_name, e.invalidation_reason AS detail FROM 'sys.telemetry_mat_view' e JOIN tables() t ON e.view_table_id=t.id WHERE e.created>=dateadd('h',-@incident_hours,now()) AND t.table_name=${targetSql} AND e.event IN (202,203)) SELECT observed_at AS "Time (UTC)",event_name AS "Event",detail AS "Details" FROM history ORDER BY observed_at DESC LIMIT 100`,
    highlightConfig: incidentHighlights(false),
  },
  {
    name: "Reading the data",
    type: "markdown",
    row: 93,
    x: 0,
    w: 12,
    height: 116,
    value: hiddenRefreshReason
      ? `### Reading the data
Charts use completed 1-minute buckets from WAL telemetry, which the server keeps for one week. Rate charts show 0 for idle minutes, and an empty chart means nothing happened in its window. A chart holds at most ${maxBuckets} buckets, so charts cover at most the latest ${maxBuckets} minutes of **window_minutes**. Refresh charts and incidents are hidden because ${hiddenRefreshReason}. **Refresh age** is the time since the last refresh finished, whether it succeeded or failed.`
      : `### Reading the data
Charts use completed 1-minute buckets from telemetry, which the server keeps for one week. Rate charts show 0 for idle minutes. Duration and ratio charts only have points for minutes with events, so an empty chart or log means nothing happened in its window. A chart holds at most ${maxBuckets} buckets, so charts cover at most the latest ${maxBuckets} minutes of **window_minutes**. Views that refresh weekly or less often, and manual views, will show few refreshes or none.`,
  },
]
