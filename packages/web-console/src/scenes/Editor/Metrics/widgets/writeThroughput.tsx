import React from "react"
import uPlot from "uplot"
import type { Widget, RowsApplied } from "../types"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeThroughput: Widget = {
  distribution: 1,
  label: "Write throughput",
  getDescription: ({ lastValue, sampleBy }) => (
    <>
      Logical (queryable) rows applied to table.
      <br />
      {lastValue ? `Currently: ${lastValue}/${sampleBy}` : ""}
    </>
  ),
  iconUrl: "/assets/metric-rows-applied.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, from, to }) => {
    return `
select
    created time,
    sum(rowCount) numOfRowsApplied,
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 105
sample by ${sampleBy}
FROM timestamp_floor('${sampleBy}', '${from}')
  TO timestamp_floor('${sampleBy}', '${to}')
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
