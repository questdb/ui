import type { ColumnDefinition, Value } from "../../../src/utils/questdb/types"

const timestamp = "2026-11-01T12:00:00.000000Z"
type Field = [name: string, type: string, value: Value]
const text = (name: string, value = "Running"): Field => [name, "STRING", value]
const number = (name: string, value = 10): Field => [name, "DOUBLE", value]
const time = (name: string): Field => [name, "TIMESTAMP", timestamp]
const history = (...names: string[]): Field[] => [
  time("created"),
  ...names.map((name) => number(name)),
]
const percentiles = (prefix: string, unit: string): string[] =>
  [50, 90, 95, 99].map((p) => `${prefix}p${p} ${unit}`)

// Fixed HTTP response fixtures, independent of the template's chart/highlight
// configuration. They exercise client-side contracts, not the SQL compiler.
export const monitoringResponse = (
  panel: string,
  kind: "table" | "matview",
  walEnabled: boolean,
  queryIndex = 0,
  target = "trades",
) => {
  const disk = kind === "table" ? "Disk GiB" : "Disk MiB"
  const fields: Record<string, Field[]> = {
    "Live table health": [
      text("Table", target),
      number("Rows", 2),
      text("WAL status", walEnabled ? "Running" : "Disabled"),
      ...(walEnabled
        ? [
            number("Pending rows"),
            number("Pending txns"),
            text("Memory pressure", "None"),
          ]
        : []),
      number("Write age (s)"),
    ],
    "Live view health": [
      text("View", target),
      text("Status", "valid"),
      text("Base table", "source_trades"),
      text("Base status"),
      number("Rows", 2),
      number("Pending base txns"),
      number("Refresh age (s)"),
      text("Reason", ""),
    ],
    "Ingestion · rows/s": history("WAL rows/s", "Applied rows/s"),
    "Queue & apply · ms": history(
      ...percentiles(queryIndex === 0 ? "Queue " : "Apply ", "ms"),
    ),
    "Partition footprint · GiB": [
      text("Partition", "2026-11-01"),
      number("Disk GiB"),
    ],
    "Partition footprint · MiB": [
      text("Partition", "2026-11-01"),
      number("Disk MiB"),
    ],
    "Live partitions": [
      text("Partition", "2026-11-01"),
      number(disk),
      number("Rows", 2),
      text("State", "Active"),
      number("Dead rows", 0),
      number("Pieces", 1),
    ],
    "Downstream views": [
      text("View", "trades_1m"),
      text("Status", "valid"),
      number("Pending txns"),
      time("Last refresh (UTC)"),
    ],
    "Transactions · txns/s": history("Committed txns/s", "Applied txns/s"),
    "Transaction size · history": history(
      "Mean rows/txn",
      ...percentiles("", "rows/txn"),
    ),
    "Write workload · rows/s": history("Logical rows/s", "Physical rows/s"),
    "Write amplification · ratio": history("Physical / logical rows"),
    "Refresh duration · ms": history(...percentiles("", "ms")),
    "Refreshes per minute": history("Successful", "Failed"),
    "Refresh setup & WAL health": [
      text("View", target),
      text("Refresh type", "timer"),
      text("Schedule", "1 HOUR"),
      text("Partitioning", "DAY"),
      text("TTL", "None"),
      text("WAL status"),
      number("Pending WAL rows"),
      text("Memory pressure", "None"),
    ],
    "View output · rows/s": history("Logical rows/s", "Physical rows/s"),
    "View write amplification": history("Physical / logical rows"),
    "Incident counts": [
      text("Event", "WAL suspended"),
      number("Count", 1),
      text("Signal", "Review"),
      time("Last seen (UTC)"),
    ],
    "Recent incidents": [
      time("Time (UTC)"),
      text("Event", "WAL suspended"),
      ...(kind === "matview" ? [text("Details", "Refresh failed")] : []),
    ],
  }
  const row = fields[panel]
  if (!row) throw new Error(`Missing response fixture for ${panel}`)
  return {
    columns: row.map(([name, type]): ColumnDefinition => ({ name, type })),
    dataset: [row.map(([, , value]) => value)],
    count: 1,
  }
}
