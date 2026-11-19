import type { MonitoringCellTemplate, MonitoringTemplateValues } from "./types"
import {
  healthHighlights,
  partitionHighlights,
  downstreamHighlights,
} from "./highlights"

// Reviewed monitoring layout: preserve paired pane heights when adding panels.
export const tableTemplate = ({
  targetSql,
  targetName,
  window1m,
  window5s,
  maxBuckets,
  maxMinutes5s,
}: MonitoringTemplateValues): MonitoringCellTemplate[] => [
  {
    name: "Live table monitoring",
    type: "markdown",
    row: 0,
    x: 0,
    w: 12,
    height: 86,
    value: `# Table monitoring · ${targetName}
Live health, ingestion, partitions and downstream views. You can change the chart window (**window_minutes**) in **Variables**.`,
  },
  {
    name: "Live table health",
    row: 5,
    x: 0,
    w: 12,
    height: 176,
    autoRefresh: "1s",
    // A suspension's reason is only kept live, by wal_tables(): the server
    // records WAL suspend/resume telemetry without the table it happened to.
    value: `SELECT t.table_name AS "Table",t.table_row_count AS "Rows",
 CASE WHEN t.table_suspended THEN 'Suspended' ELSE 'Running' END AS "WAL status",
 t.wal_pending_row_count AS "Pending rows",CASE WHEN w.sequencerTxn IS NULL OR w.writerTxn IS NULL THEN NULL WHEN w.sequencerTxn>w.writerTxn THEN w.sequencerTxn-w.writerTxn ELSE 0 END AS "Pending txns",
 CASE t.table_memory_pressure_level WHEN 0 THEN 'None' WHEN 1 THEN 'Reduced parallelism' WHEN 2 THEN 'Backoff' ELSE 'Unknown' END AS "Memory pressure",
 CAST((now()-t.table_last_write_timestamp)/1000000.0 AS DECIMAL(16,3)) AS "Write age (s)",
 nullif(w.errorMessage,'') AS "Suspend reason"
FROM tables() t LEFT JOIN wal_tables() w ON w.name=t.table_name WHERE t.table_name=${targetSql}`,
    highlightConfig: healthHighlights(
      "Table",
      ["WAL status", "Memory pressure"],
      ["Rows", "Pending rows", "Pending txns"],
    ),
  },
  {
    name: "Ingestion",
    type: "markdown",
    row: 10,
    x: 0,
    w: 12,
    height: 86,
    value: `### Ingestion and apply
These charts use 5-second buckets. WAL rows/s shows rows committed to the WAL and Applied rows/s shows rows written to the table. Queue ms is how long a commit waits before it is applied. If the two rates drift apart or the queue time keeps rising, apply is falling behind.`,
  },
  {
    name: "Ingestion · rows/s",
    row: 13,
    x: 0,
    w: 6,
    height: 356,
    autoRefresh: "5s",
    value: `SELECT w.created, sum(CASE WHEN w.event=109 THEN w.rowCount ELSE 0 END)/5.0 AS "WAL rows/s", sum(CASE WHEN w.event=105 THEN w.rowCount ELSE 0 END)/5.0 AS "Applied rows/s" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-${window5s},timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=${targetSql} AND w.event IN (109,105) AND w.rowCount>0 SAMPLE BY 5s FROM dateadd('m',-${window5s},timestamp_floor('5s',now())) TO timestamp_floor('5s',now()) FILL(0,0)`,
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
    autoRefresh: "5s",
    value: `SELECT w.created, approx_percentile(w.latency, 0.5) AS "Queue p50 ms",
       approx_percentile(w.latency, 0.9) AS "Queue p90 ms",
       approx_percentile(w.latency, 0.95) AS "Queue p95 ms",
       approx_percentile(w.latency, 0.99) AS "Queue p99 ms" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-${window5s},timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=${targetSql} AND w.event=103 SAMPLE BY 5s ALIGN TO CALENDAR;
SELECT w.created, approx_percentile(w.latency, 0.5) AS "Apply p50 ms",
       approx_percentile(w.latency, 0.9) AS "Apply p90 ms",
       approx_percentile(w.latency, 0.95) AS "Apply p95 ms",
       approx_percentile(w.latency, 0.99) AS "Apply p99 ms" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-${window5s},timestamp_floor('5s',now())) AND w.created<timestamp_floor('5s',now()) AND t.table_name=${targetSql} AND w.event=105 AND w.rowCount>0 SAMPLE BY 5s ALIGN TO CALENDAR`,
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
    name: "Partitions",
    type: "markdown",
    row: 27,
    x: 0,
    w: 12,
    height: 86,
    value: `### Partitions
Active and newest partitions are listed first. Arrows mark values that changed since the last refresh, and new partitions flash blue for a moment. **Dead rows** are replaced rows that are still on disk. **Pieces** above 1 means the partition is split into several files. The footprint chart shows the current size of each partition, with split partitions counted together.`,
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
 FROM table_partitions(${targetSql}) p CROSS JOIN tables() t
 WHERE p.attached AND t.table_name=${targetSql}
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
FROM table_partitions(${targetSql})
WHERE attached ORDER BY active DESC, minTimestamp DESC`,
    highlightConfig: partitionHighlights("Disk GiB"),
  },
  {
    name: "Downstream view health",
    type: "markdown",
    row: 47,
    x: 0,
    w: 12,
    height: 86,
    value: `### Downstream view health
**Pending txns** is the number of this table's transactions a view hasn't picked up yet. It grows between refreshes of timer and manual views. For refresh times and failures, open the view's own monitoring dashboard. If the grid is empty, no views are built on this table.`,
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
FROM materialized_views() WHERE base_table_name=${targetSql} ORDER BY view_name`,
    highlightConfig: downstreamHighlights(),
  },
  {
    name: "Write efficiency",
    type: "markdown",
    row: 66,
    x: 0,
    w: 12,
    height: 86,
    value: `### Investigate write efficiency
These charts use 1-minute buckets. Look at the transaction rate next to the transaction size, then compare physical write work with amplification. The rates count every processed row, not net growth. Amplification is physical rows divided by logical rows for each minute, so it won't always match **Write Amplification (p50)** in the table details.`,
  },
  {
    name: "Transactions · txns/s",
    row: 71,
    x: 0,
    w: 6,
    height: 356,
    autoRefresh: "60s",
    value: `SELECT w.created,
 sum(CASE WHEN w.event=109 THEN 1 ELSE 0 END)/60.0 AS "Committed txns/s",
 sum(CASE WHEN w.event=105 THEN 1 ELSE 0 END)/60.0 AS "Applied txns/s"
FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created >= dateadd('m', -${window1m}, timestamp_floor('m', now()))
 AND w.created < timestamp_floor('m', now())
 AND t.table_name = ${targetSql} AND w.event IN (109,105) AND w.rowCount>0
SAMPLE BY 1m FROM dateadd('m', -${window1m}, timestamp_floor('m', now())) TO timestamp_floor('m', now()) FILL(0,0)`,
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
    autoRefresh: "60s",
    value: `SELECT w.created, avg(w.rowCount) AS "Mean rows/txn", approx_percentile(w.rowCount, 0.5) AS "p50 rows/txn",
       approx_percentile(w.rowCount, 0.9) AS "p90 rows/txn",
       approx_percentile(w.rowCount, 0.95) AS "p95 rows/txn",
       approx_percentile(w.rowCount, 0.99) AS "p99 rows/txn" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-${window1m},timestamp_floor('m',now())) AND w.created<timestamp_floor('m',now()) AND t.table_name=${targetSql} AND w.event=109 AND w.rowCount>0 SAMPLE BY 1m ALIGN TO CALENDAR`,
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
    name: "Write amplification · ratio",
    row: 85,
    x: 6,
    w: 6,
    height: 356,
    autoRefresh: "60s",
    value: `SELECT w.created, sum(w.physicalRowCount)*1.0/nullif(sum(w.rowCount),0) AS "Physical / logical rows" FROM 'sys.telemetry_wal' w JOIN tables() t ON w.tableId=t.id
WHERE w.created>=dateadd('m',-${window1m},timestamp_floor('m',now())) AND w.created<timestamp_floor('m',now()) AND t.table_name=${targetSql} AND w.event=105 AND w.rowCount>0 SAMPLE BY 1m ALIGN TO CALENDAR`,
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
    name: "Reading the data",
    type: "markdown",
    row: 118,
    x: 0,
    w: 12,
    height: 116,
    value: `### Reading the data
The charts come from telemetry, which the server keeps for one week. Rate charts show 0 when nothing happened. Latency, size and ratio charts only have points where something happened, so an empty chart means there were no events in the window. A chart holds at most ${maxBuckets} buckets, so 5-second charts cover at most the latest ${maxMinutes5s} minutes of **window_minutes** and 1-minute charts the latest ${maxBuckets}. The grids show the current state and keep no history. **Write age** is the time since the server last applied WAL data to the table. After a restart it counts from the newest row's timestamp.`,
  },
]
