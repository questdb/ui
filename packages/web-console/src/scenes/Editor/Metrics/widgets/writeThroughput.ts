import uPlot from "uplot"
import type { Widget } from "../utils"
import {
  RowsApplied,
  defaultSampleByForDuration,
  sqlValueToFixed,
  formatNumbers,
} from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeThroughput: Widget = {
  label: "Write throughput",
  iconUrl: "/assets/metric-rows-applied.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, metricDuration, sampleBy, limit, timeFilter }) => {
    return `
select
    created time,
    count(rowCount) numOfWalApplies,
    sum(rowCount) numOfRowsApplied,
    sum(physicalRowCount) numOfRowsWritten
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 105
sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}
${timeFilter ? timeFilter : ""}
fill(null)
${limit ? `limit ${limit}` : ""}`
  },
  getQueryLastNotNull: (tableId) => `
select
  created
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 105
and rowCount != null
and physicalRowCount != null
limit -1
`,
  alignData: (data: RowsApplied[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.time).getTime()),
    data.map((l) =>
      l.numOfRowsApplied ? sqlValueToFixed(l.numOfRowsApplied) : 0,
    ),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
