import React from "react"
import uPlot from "uplot"
import type { Widget, WriteAmplification } from "../types"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeAmplification: Widget = {
  distribution: 3,
  label: "Write amplification",
  getDescription: ({ lastValue, sampleBy }) => (
    <>
      Ratio of rows physically written to disk against logical/queryable rows.
      If write amplification is higher than 1, this means data has been
      re-written several times. This will be higher during O3 writes.
      <br />
      {lastValue ? `Currently: ${lastValue} for the last ${sampleBy}` : ""}
    </>
  ),
  iconUrl: "/assets/metric-write-amplification.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, from, to }) => {
    return `
select
created,
  case when phy_row_count/row_count = null then 1 else phy_row_count/row_count end as writeAmplification
from (  
  select 
    created, 
    sum(phy_row_count) over (order by created rows between 59 PRECEDING and CURRENT row) phy_row_count,
    sum(row_count) over (order by created rows between 59 PRECEDING and CURRENT row) row_count
    from (
      select 
        created, 
        sum(rowcount) row_count,
        sum(physicalRowCount) phy_row_count,
      from ${TelemetryTable.WAL}
      where ${tableId ? `tableId = ${tableId} and ` : ""}
         event = 105
         and rowCount > 0
      sample by ${sampleBy}      
    FROM timestamp_floor('${sampleBy}', '${from}')
  TO timestamp_floor('${sampleBy}', '${to}')
      fill(null)
      ${limit ? `limit ${limit}` : ""}
  )
);
    `
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
  alignData: (data: WriteAmplification[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.created).getTime()),
    data.map((l) =>
      l.writeAmplification ? sqlValueToFixed(l.writeAmplification) : 1,
    ),
  ],
  mapYValue: (rawValue: number) => rawValue,
}
