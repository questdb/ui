import uPlot from "uplot"
import type { Widget, Latency } from "../types"
import { sqlValueToFixed } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const latency: Widget = {
  label: "WAL apply latency in ms",
  description:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio.",
  iconUrl: "/assets/metric-read-latency.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, timeFilter }) => {
    return `
select created, approx_percentile(latency, 0.9, 3) latency
  from ${TelemetryTable.WAL}
  where 
      event = 105 -- event is fixed
      and rowCount > 0 -- this is fixed clause, we have rows with - rowCount logged
      ${tableId ? `and tableId = ${tableId}` : ""}
  sample by ${sampleBy}
  ${timeFilter ? timeFilter : ""}
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