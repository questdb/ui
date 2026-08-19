import React from "react"
import uPlot from "uplot"
import type { Widget, TableAverageTransactionSize } from "../types"
import { sqlValueToFixed } from "../utils"

export const tableAvgTransactionSize: Widget = {
  distribution: 1,
  label: "Average Transaction Size",
  chartTitle: "Average Transaction Size (rows/txn)",
  getDescription: () => (
    <>
      This chart tracks the mean size of transactions processed through the
      database API. While the database is optimized for both small and large
      transactions, larger batch sizes generally lead to better database
      performance. Monitor this metric to understand your API&apos;s transaction
      patterns and identify opportunities for batch size optimization. Key
      aspects to observe:
      <ul>
        <li>Transaction size trends and variations</li>
        <li>Any unusually small transactions that could be batched</li>
        <li>Consistency of batch sizes across time periods</li>
      </ul>
    </>
  ),
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    return `
      select
           created,
           avg(rowCount) avg_rows,
      from sys.telemetry_wal
      where ${tableId ? `tableId = ${tableId} ` : ""}
           and event = 105
      sample by ${sampleBySeconds}s FROM timestamp_floor('${sampleBySeconds}s', '${from}') TO timestamp_floor('${sampleBySeconds}s', '${to}') fill(0)
    `
  },
  alignData: (data): uPlot.AlignedData => {
    const rows = data as TableAverageTransactionSize[]
    return [
      rows.map((l) => new Date(l.created).getTime()),
      rows.map((l) => (l.avg_rows ? sqlValueToFixed(l.avg_rows) : 1)),
    ]
  },
  mapYValue: (rawValue: number) => rawValue,
}
