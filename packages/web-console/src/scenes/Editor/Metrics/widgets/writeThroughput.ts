import uPlot from "uplot"
import { RowsApplied, sqlValueToFixed, formatNumbers } from "../utils"
import { Widget, defaultSampleByForDuration, durationInMinutes } from "../utils"
import { TelemetryTable } from "../../../../consts"
import { getTimeFilter } from "./utils"

export const writeThroughput: Widget = {
  label: "Write throughput",
  iconUrl: "/assets/metric-rows-applied.svg",
  isTableMetric: true,
  getQuery: ({ tableId, metricDuration, sampleBy }) => {
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
sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}`
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
  alignData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
    rowsApplied.map((l) => new Date(l.time).getTime()),
    rowsApplied.map((l) => sqlValueToFixed(l.numOfRowsApplied)),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
