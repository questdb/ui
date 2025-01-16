import React from "react"
import uPlot from "uplot"
import type { Widget, Latency } from "../types"
import { sqlValueToFixed } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const latency: Widget = {
  distribution: 1,
  label: "WAL apply latency in ms",
  getDescription: ({ lastValue, sampleBy }) => (
    <>
      Average time taken to apply WAL transactions to the table, making them
      readable.
      <br />
      {lastValue ? `Currently: ${lastValue} for the last ${sampleBy}` : ""}
    </>
  ),
  iconUrl: "/assets/metric-read-latency.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, from, to }) => {
    return `
select created, approx_percentile(latency, 0.9, 3) latency
  from ${TelemetryTable.WAL}
  where 
      event = 105 -- event is fixed
      and rowCount > 0 -- this is fixed clause, we have rows with - rowCount logged
      ${tableId ? `and tableId = ${tableId}` : ""}
  sample by ${sampleBy}
  FROM timestamp_floor('${sampleBy}', '${from}')
  TO timestamp_floor('${sampleBy}', '${to}')
  fill(0)
  ${limit ? `limit ${limit}` : ""}
  `
  },
  getQueryLastNotNull: (tableId) => `
select
  created
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 105
and latency != null and rowCount > 0
limit -1
`,
  alignData: (data: Latency[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.created).getTime()),
    data.map((l) => sqlValueToFixed(l.latency)),
  ],
  mapYValue: (rawValue: number) => {
    if (rawValue >= 1000) {
      const seconds = rawValue / 1000
      return `${seconds.toFixed(2)} s`
    }
    return `${rawValue} ms`
  },
}
