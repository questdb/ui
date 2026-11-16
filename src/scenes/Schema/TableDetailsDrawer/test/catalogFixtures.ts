import type { TableKind } from "../../../../utils/questdb/types"

export const raw = (
  rows: Record<string, unknown>[],
  template = rows[0] ?? {},
) => ({
  columns: Object.entries(template).map(([name, value]) => ({
    name,
    type:
      typeof value === "bigint"
        ? "LONG"
        : typeof value === "boolean"
          ? "BOOLEAN"
          : typeof value === "number"
            ? "DOUBLE"
            : "STRING",
  })),
  dataset: rows.map((row) =>
    Object.keys(template).map((key) =>
      typeof row[key] === "bigint" ? String(row[key]) : row[key],
    ),
  ),
  count: rows.length,
})
export const table = (name = "trades", kind: TableKind = "table") => ({
  id: 1,
  table_name: name,
  table_type: ({ table: "T", matview: "M", liveview: "L", view: "V" } as const)[
    kind
  ],
  partitionBy: "DAY",
  designatedTimestamp: "timestamp",
  directoryName: `${name}~1`,
  walEnabled: true,
  dedup: false,
  maxUncommittedRows: 500000,
  o3MaxLag: BigInt(0),
  table_suspended: false,
  table_row_count: BigInt(12),
  table_txn: BigInt(100),
  table_last_write_timestamp: null,
  table_max_timestamp: null,
  table_memory_pressure_level: 0,
  wal_pending_row_count: BigInt(0),
  wal_txn: BigInt(100),
  wal_tx_count: BigInt(0),
  wal_max_timestamp: null,
  table_write_amp_p50: 1,
  wal_tx_size_p90: BigInt(1000),
})
export const liveView = (name = "trades_lv", base = "trades") => ({
  view_name: name,
  base_table_name: base,
  view_status: "active",
  view_sql: `select * from ${base}`,
  view_table_dir_name: `${name}~2`,
  invalidation_reason: null,
  flush_every_interval: BigInt(1),
  flush_every_interval_unit: "s",
  in_memory_interval: BigInt(5),
  in_memory_interval_unit: "s",
  view_lower_bound_timestamp: null,
  lag_seqtxn: BigInt(0),
  lag_micros: BigInt(0),
  writer_stall_micros: BigInt(0),
  in_mem_rows: BigInt(12),
  in_mem_bytes: BigInt(1024),
  below_lower_bound_count: BigInt(0),
  o3_rejected_count: BigInt(0),
  last_processed_seqtxn: BigInt(100),
  seed_target_seqtxn: BigInt(100),
})
export const matView = () => ({
  view_name: "trades_mv",
  base_table_name: "trades",
  view_status: "valid",
  refresh_type: "incremental",
  invalidation_reason: null,
  refresh_base_table_txn: BigInt(100),
  base_table_txn: BigInt(100),
})
