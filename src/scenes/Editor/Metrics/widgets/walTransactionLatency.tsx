import React from "react"
import uPlot from "uplot"
import type { Widget, WalTransactionLatency } from "../types"
import { sqlValueToFixed } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const walTransactionLatency: Widget = {
  distribution: 1,
  label: "WAL Transaction Latency",
  chartTitle: "WAL Transaction Latency (90th percentile)",
  getDescription: () => (
    <>
      This chart tracks the time required for data to become readable after
      being written. Higher latency may stem from:
      <ul>
        <li>
          Large transaction sizes (refer to Avg Transaction Size chart if
          elevated)
        </li>
        <li>Unordered data requiring additional processing</li>
        <li>
          Write amplification (see dedicated chart if batch size is optimal)
        </li>
        <li>Storage I/O limitations or contention</li>
      </ul>
      Monitor this metric alongside related charts to identify the root cause of
      performance variations and optimize accordingly.
    </>
  ),
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    return `
    select created, approx_percentile(latency, 0.9, 3) latency
      from ${TelemetryTable.WAL}
      where 
          event = 105
          and rowCount > 0
          ${tableId ? `and tableId = ${tableId}` : ""}
      sample by ${sampleBySeconds}s
      FROM timestamp_floor('${sampleBySeconds}s', '${from}')
      TO timestamp_floor('${sampleBySeconds}s', '${to}')
      fill(0)
    `
  },
  alignData: (data): uPlot.AlignedData => {
    const rows = data as WalTransactionLatency[]
    return [
      rows.map((l) => new Date(l.created).getTime()),
      rows.map((l) => sqlValueToFixed(l.latency)),
    ]
  },
  mapYValue: (rawValue: number) => {
    if (rawValue >= 1000) {
      const seconds = rawValue / 1000
      return `${seconds.toFixed(2)} s`
    }
    return `${rawValue} ms`
  },
}
