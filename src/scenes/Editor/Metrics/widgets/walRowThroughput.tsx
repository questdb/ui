import React from "react"
import uPlot from "uplot"
import type { Widget, WalRowThroughput } from "../types"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const walRowThroughput: Widget = {
  distribution: 1,
  label: "WAL Row Throughput",
  chartTitle: "Row Processing Throughput (rows/s)",
  getDescription: () => (
    <>
      This chart displays rows processed per second during transaction merges.
      While similar to transaction throughput, this metric helps identify:
      <ul>
        <li>Data density variations within transactions</li>
        <li>Processing overhead for row-heavy transactions</li>
        <li>Resource utilization from row-level operations</li>
        <li>Impact of row complexity on merge performance</li>
      </ul>
      Use alongside transaction throughput to understand the relationship
      between transaction size and processing efficiency.{" "}
    </>
  ),
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    return `
      select created time,
          sum(rowCount) numOfRowsApplied
      from ${TelemetryTable.WAL}
      where ${tableId ? `tableId = ${tableId} and ` : ""}
        event = 105
        sample by 1s
      FROM timestamp_floor('${sampleBySeconds}s', '${from}') TO timestamp_floor('${sampleBySeconds}s', '${to}') fill(0)
    `
  },
  alignData: (data): uPlot.AlignedData => {
    const rows = data as WalRowThroughput[]
    return [
      rows.map((l) => new Date(l.time).getTime()),
      rows.map((l) =>
        l.numOfRowsApplied ? sqlValueToFixed(l.numOfRowsApplied) : 0,
      ),
    ]
  },
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
