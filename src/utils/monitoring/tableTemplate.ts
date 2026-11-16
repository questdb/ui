import type { MonitoringCellTemplate } from "./types"
import {
  healthHighlights,
  partitionHighlights,
  downstreamHighlights,
  incidentHighlights,
} from "./highlights"

// Reviewed monitoring layout: preserve paired pane heights when adding panels.
export const tableTemplate = (): MonitoringCellTemplate[] => [
  {
    name: "Live table monitoring",
    type: "markdown",
    row: 0,
    x: 0,
    w: 12,
    height: 86,
    value: `# Table monitoring · __TARGET_NAME__
Live health, ingestion, partitions and downstream views. Adjust the time windows in **Variables**.`,
  },
  {
    name: "Live table health",
    row: 5,
    x: 0,
    w: 12,
    height: 176,
    autoRefresh: "1s",
    value: `SELECT table_name AS "Table",table_row_count AS "Rows",
 CASE WHEN table_suspended THEN 'Suspended' ELSE 'Running' END AS "WAL status",
 wal_pending_row_count AS "Pending rows",CASE WHEN wal_txn IS NULL OR table_txn IS NULL THEN NULL WHEN wal_txn>table_txn THEN wal_txn-table_txn ELSE 0 END AS "Pending txns",
 CASE table_memory_pressure_level WHEN 0 THEN 'None' WHEN 1 THEN 'Reduced parallelism' WHEN 2 THEN 'Backoff' ELSE 'Unknown' END AS "Memory pressure",
 CAST((now()-table_last_write_timestamp)/1000000.0 AS DECIMAL(16,3)) AS "Write age (s)"
FROM tables() WHERE table_name=__TARGET_SQL__`,
    highlightConfig: healthHighlights(
      "Table",
      ["WAL status", "Memory pressure"],
      ["Rows", "Pending rows", "Pending txns"],
    ),
  },
  {
    name: "Ingestion · rows/s",
    row: 13,
    x: 0,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "5s",
    value: `SELECT w.created, sum(CASE WHEN w.event=109 THEN w.rowCount ELSE 0 END)/5.0 AS "WAL rows/s", sum(CASE WHEN w.event=105 THEN w.rowCount ELSE 0 END)/5.0 AS "Applied rows/s" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-@window_minutes,timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=__TARGET_SQL__ AND w.event IN (109,105) AND w.rowCount>0 SAMPLE BY 5s ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: ["WAL rows/s", "Applied rows/s"],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "Queue & apply · ms",
    row: 13,
    x: 6,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "5s",
    value: `SELECT w.created, approx_percentile(w.latency, 0.5) AS "Queue p50 ms",
       approx_percentile(w.latency, 0.9) AS "Queue p90 ms",
       approx_percentile(w.latency, 0.95) AS "Queue p95 ms",
       approx_percentile(w.latency, 0.99) AS "Queue p99 ms" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-@window_minutes,timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=__TARGET_SQL__ AND w.event=103 SAMPLE BY 5s ALIGN TO CALENDAR;
SELECT w.created, approx_percentile(w.latency, 0.5) AS "Apply p50 ms",
       approx_percentile(w.latency, 0.9) AS "Apply p90 ms",
       approx_percentile(w.latency, 0.95) AS "Apply p95 ms",
       approx_percentile(w.latency, 0.99) AS "Apply p99 ms" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-@window_minutes,timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=__TARGET_SQL__ AND w.event=105 AND w.rowCount>0 SAMPLE BY 5s ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: [
            "Queue p50 ms",
            "Queue p90 ms",
            "Queue p95 ms",
            "Queue p99 ms",
          ],
          axis: "left",
        },
        {
          type: "line",
          yColumns: [
            "Apply p50 ms",
            "Apply p90 ms",
            "Apply p95 ms",
            "Apply p99 ms",
          ],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "Live partitions",
    type: "markdown",
    row: 27,
    x: 0,
    w: 12,
    height: 86,
    value: `### Follow the writes
Active and newest partitions come first. Arrows show changes in numeric values; new partitions briefly highlight blue. The footprint chart combines splits into logical partitions.`,
  },
  {
    name: "Partition footprint · GiB",
    row: 32,
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
 FROM table_partitions(__TARGET_SQL__) p CROSS JOIN tables() t
 WHERE p.attached AND t.table_name=__TARGET_SQL__
)
SELECT logical_partition AS "Partition", sum(disk_size)/1073741824.0 AS "Disk GiB"
FROM pieces GROUP BY logical_partition ORDER BY logical_partition`,
    chartConfig: {
      xColumn: "Partition",
      queries: [
        {
          type: "bar",
          yColumns: ["Disk GiB"],
          axis: "right",
        },
      ],
      rightAxis: {
        min: 0,
        name: "GiB",
      },
    },
  },
  {
    name: "Live partitions",
    row: 32,
    x: 6,
    w: 6,
    height: 386,
    autoRefresh: "5s",
    value: `SELECT name AS "Partition",
 cast(diskSize/1073741824.0 AS DECIMAL(16,3)) AS "Disk GiB",
 numRows AS "Rows",
 CASE WHEN active THEN 'Active' ELSE 'Historical' END AS "State",
 deadRows AS "Dead rows",
 pieceCount AS "Pieces"
FROM table_partitions(__TARGET_SQL__)
WHERE attached ORDER BY active DESC, minTimestamp DESC`,
    highlightConfig: partitionHighlights("Disk GiB"),
  },
  {
    name: "Downstream views",
    type: "markdown",
    row: 47,
    x: 0,
    w: 12,
    height: 86,
    value: `### Downstream view health
Check status, pending work and last refresh below. For refresh latency and failures, open the materialized view's monitoring dashboard. Timer-based views can accumulate pending work between runs.`,
  },
  {
    name: "Downstream views",
    row: 52,
    x: 0,
    w: 12,
    height: 356,
    autoRefresh: "2s",
    value: `SELECT view_name AS "View",view_status AS "Status",
 CASE WHEN base_table_txn IS NULL OR refresh_base_table_txn IS NULL THEN NULL
 WHEN base_table_txn>refresh_base_table_txn THEN base_table_txn-refresh_base_table_txn ELSE 0 END AS "Pending txns",
 last_refresh_finish_timestamp AS "Last refresh (UTC)"
FROM materialized_views() WHERE base_table_name=__TARGET_SQL__ ORDER BY view_name`,
    highlightConfig: downstreamHighlights(),
  },
  {
    name: "Write efficiency",
    type: "markdown",
    row: 66,
    x: 0,
    w: 12,
    height: 86,
    history: true,
    value: `### Investigate write efficiency
These charts use **1-minute buckets**. Compare transaction rate with batch size, then physical write work with amplification. Rates count processed rows, not net growth; amplification is physical/logical rows, not the drawer's p50.`,
  },
  {
    name: "Transactions · txns/s",
    row: 71,
    x: 0,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `SELECT w.created,
 sum(CASE WHEN w.event=109 THEN 1 ELSE 0 END)/60.0 AS "Committed txns/s",
 sum(CASE WHEN w.event=105 THEN 1 ELSE 0 END)/60.0 AS "Applied txns/s"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created >= dateadd('m', -@window_minutes, timestamp_floor('m', now()))
 AND w.created < timestamp_floor('m', now())
 AND t.table_name = __TARGET_SQL__ AND w.event IN (109,105) AND w.rowCount>0
SAMPLE BY 1m ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: ["Committed txns/s", "Applied txns/s"],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "Transaction size · history",
    row: 71,
    x: 6,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `SELECT w.created, avg(w.rowCount) AS "Mean rows/txn", approx_percentile(w.rowCount, 0.5) AS "p50 rows/txn",
       approx_percentile(w.rowCount, 0.9) AS "p90 rows/txn",
       approx_percentile(w.rowCount, 0.95) AS "p95 rows/txn",
       approx_percentile(w.rowCount, 0.99) AS "p99 rows/txn" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-@window_minutes,timestamp_floor('m',now())) AND w.created<timestamp_floor('m',now()) AND t.table_name=__TARGET_SQL__ AND w.event=109 AND w.rowCount>0 SAMPLE BY 1m ALIGN TO CALENDAR`,
    chartConfig: {
      xColumn: "created",
      queries: [
        {
          type: "line",
          yColumns: [
            "Mean rows/txn",
            "p50 rows/txn",
            "p90 rows/txn",
            "p95 rows/txn",
            "p99 rows/txn",
          ],
          axis: "left",
        },
      ],
    },
  },
  {
    name: "Write workload · rows/s",
    row: 85,
    x: 0,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `SELECT w.created,
 sum(w.rowCount)/60.0 AS "Logical rows/s",
 sum(w.physicalRowCount)/60.0 AS "Physical rows/s"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created >= dateadd('m', -@window_minutes, timestamp_floor('m', now()))
 AND w.created < timestamp_floor('m', now())
 AND t.table_name = __TARGET_SQL__ AND w.event=105 AND w.rowCount>0
SAMPLE BY 1m ALIGN TO CALENDAR`,
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
    name: "Write amplification · ratio",
    row: 85,
    x: 6,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `SELECT w.created, sum(w.physicalRowCount)*1.0/nullif(sum(w.rowCount),0) AS "Physical / logical rows" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-@window_minutes,timestamp_floor('m',now())) AND w.created<timestamp_floor('m',now()) AND t.table_name=__TARGET_SQL__ AND w.event=105 AND w.rowCount>0 SAMPLE BY 1m ALIGN TO CALENDAR`,
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
    name: "Incident history",
    type: "markdown",
    row: 99,
    x: 0,
    w: 12,
    height: 86,
    history: true,
    value: `### What happened before the current state?
Counts cover **incident_hours**; the log shows the latest 100 suspend/resume events. These are past events, while the live summary at the top shows the current state.`,
  },
  {
    name: "Incident counts",
    row: 104,
    x: 0,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `WITH history AS (SELECT w.created AS observed_at, CASE WHEN w.event=107 THEN 'WAL suspended' ELSE 'WAL resumed' END AS event_name, CAST(NULL AS STRING) AS detail FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id WHERE w.created>=dateadd('h',-@incident_hours,now()) AND t.table_name=__TARGET_SQL__ AND w.event IN (107,108))
SELECT k.event_name AS "Event", coalesce(h.events,0) AS "Count",
 CASE WHEN coalesce(h.events,0)=0 THEN 'None recorded' WHEN k.event_name='WAL resumed' THEN 'Resumed' ELSE 'Review' END AS "Signal", h.last_seen AS "Last seen (UTC)"
FROM (SELECT 'WAL suspended' AS event_name UNION ALL SELECT 'WAL resumed') k
LEFT JOIN (SELECT event_name,count() AS events,max(observed_at) AS last_seen FROM history GROUP BY event_name) h ON k.event_name=h.event_name`,
    highlightConfig: incidentHighlights(true),
  },
  {
    name: "Recent incidents",
    row: 104,
    x: 6,
    w: 6,
    height: 356,
    history: true,
    autoRefresh: "60s",
    value: `SELECT w.created AS "Time (UTC)",
 CASE WHEN w.event=107 THEN 'WAL suspended' ELSE 'WAL resumed' END AS "Event"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('h',-@incident_hours,now())
 AND t.table_name=__TARGET_SQL__ AND w.event IN (107,108)
ORDER BY w.created DESC LIMIT 100`,
    highlightConfig: incidentHighlights(false),
  },
  {
    name: "Reading the data",
    type: "markdown",
    row: 118,
    x: 0,
    w: 12,
    height: 116,
    value: `### Reading the data
History depends on retained telemetry. Live grids and partition footprint show current state; polling does not create stored history. Write age is time since the last tracked write. Dead rows are physical rows outside the live count; Pieces counts file pieces.`,
  },
]
