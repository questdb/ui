import uPlot from "uplot"
import { Latency, sqlValueToFixed } from "../utils"
import { Widget, mappedSampleBy, durationInMinutes } from "../utils"
import { getTimeFilter } from "./utils"
import { TelemetryTable } from "../../../../consts"

export const latency: Widget = {
  label: "WAL apply latency in ms",
  iconUrl: "/assets/metric-read-latency.svg",
  getQuery: ({ tableId, metricDuration, sampleBy }) => {
    const minutes = durationInMinutes[metricDuration]
    return `
select
    created time,
    count(latency) / 2 numOfWalApplies,
    avg(latency) * 2 avg_latency
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
(event = 105 or event = 103)
${getTimeFilter(minutes)}
sample by ${sampleBy ?? mappedSampleBy[metricDuration]}
`
  },
  getQueryLastNotNull: (tableId) => `
select
  created
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
(event = 105 or event = 103)
and latency != null
limit -1
`,
  alignData: (latency: Latency[]): uPlot.AlignedData => [
    latency.map((l) => new Date(l.time).getTime()),
    latency.map((l) => sqlValueToFixed(l.avg_latency)),
  ],
  mapYValue: (rawValue: number) => {
    if (rawValue >= 1000) {
      const seconds = rawValue / 1000
      return `${seconds.toFixed(2)} s`
    }
    return `${rawValue} ms`
  },
}
