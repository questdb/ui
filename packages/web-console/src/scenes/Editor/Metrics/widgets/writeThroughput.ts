import uPlot from "uplot"
import type { Widget } from "../utils"
import {
  RowsApplied,
  defaultSampleByForDuration,
  durationInMinutes,
  sqlValueToFixed,
  formatNumbers,
  getTimeFilter,
} from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeThroughput: Widget = {
  label: "Write throughput",
  iconUrl: "/assets/metric-rows-applied.svg",
  isTableMetric: true,
  getQuery: ({ tableId, metricDuration, sampleBy, limit }) => {
    const minutes = durationInMinutes[metricDuration]

    return `
select
    created time,
    count(rowCount) numOfWalApplies,
    sum(rowCount) numOfRowsApplied,
    sum(physicalRowCount) numOfRowsWritten,
    coalesce(avg(physicalRowCount/rowCount), 1) avgWalAmplification
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 105
and ${getTimeFilter(minutes)}
sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}
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
    data.map((l) => sqlValueToFixed(l.numOfRowsApplied)),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
