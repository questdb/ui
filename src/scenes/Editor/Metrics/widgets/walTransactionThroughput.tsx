import React from "react"
import uPlot from "uplot"
import type { Widget, WallTransactionThroughout } from "../types"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const walTransactionThroughput: Widget = {
  distribution: 1,
  label: "WAL Transaction Throughput",
  chartTitle: "Transaction Throughput (txn/s)",
  getDescription: () => (
    <>
      This chart monitors the rate at which transactions are applied to tables.
      Performance is influenced by:
      <ul>
        <li>
          Batch merging efficiency (multiple transactions processed together)
        </li>
        <li>Data ingestion rate from source</li>
        <li>Storage performance and contention</li>
        <li>Concurrent writes across multiple tables sharing resources</li>
      </ul>
      Compare against data source metrics to distinguish between ingestion
      bottlenecks and system performance limitations.
    </>
  ),
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    if (sampleBySeconds === 1) {
      return `select
            created created
            , count() commit_rate
          from ${TelemetryTable.WAL}
          where ${tableId ? `tableId = ${tableId} and ` : ""}
          event = 103
          sample by 1s
          FROM timestamp_floor('${sampleBySeconds}s', '${from}')
             TO timestamp_floor('${sampleBySeconds}s', '${to}')
          fill(0)`
    } else {
      return `select created, max(commit_rate) commit_rate from (
        select
          created created
          , count() commit_rate
        from ${TelemetryTable.WAL}
        where ${tableId ? `tableId = ${tableId} and ` : ""}
        event = 103
        sample by 1s FROM timestamp_floor('1s', '${from}') TO timestamp_floor('1s', '${to}') fill(0)
        ) sample by ${sampleBySeconds}s`
    }
  },
  alignData: (data): uPlot.AlignedData => {
    const rows = data as WallTransactionThroughout[]
    return [
      rows.map((l) => Date.parse(l.created)),
      rows.map((l) => sqlValueToFixed(l.commit_rate)),
    ]
  },
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
