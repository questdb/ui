import uPlot from "uplot"
import { Latency, sqlValueToFixed } from "../utils"
import { Widget, defaultSampleByForDuration, durationInMinutes } from "../utils"
import { getTimeFilter } from "./utils"
import { TelemetryTable } from "../../../../consts"

export const latency: Widget = {
  label: "WAL apply latency in ms",
  iconUrl: "/assets/metric-read-latency.svg",
  isTableMetric: true,
  getQuery: ({ tableId, metricDuration, sampleBy }) => {
    const minutes = durationInMinutes[metricDuration]
    return `
select created, approx_percentile(latency, 0.9, 3) latency
  from
    (select * from ${TelemetryTable.WAL} where ${getTimeFilter(minutes)})
  where 
      event = 105 -- event is fixed
      and rowCount > 0 -- this is fixed clause, we have rows with - rowCount logged
      ${tableId ? `and tableId = ${tableId}` : ""}
  sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}
  fill(0)
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
  alignData: (latency: Latency[]): uPlot.AlignedData => [
    latency.map((l) => new Date(l.created).getTime()),
    latency.map((l) => sqlValueToFixed(l.latency)),
  ],
  mapYValue: (rawValue: number) => {
    if (rawValue >= 1000) {
      const seconds = rawValue / 1000
      return `${seconds.toFixed(2)} s`
    }
    return `${rawValue} ms`
  },
}
