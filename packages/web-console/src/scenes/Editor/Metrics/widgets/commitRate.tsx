import React from "react"
import uPlot from "uplot"
import type { Widget, CommitRate } from "../types"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const commitRate: Widget = {
  distribution: 1,
  label: "Commit rate",
  getDescription: ({ lastValue, sampleBy }) => (
    <>
      Number of commits written to the table.
      <br />
      {lastValue ? `Currently: ${lastValue}/${sampleBy}` : ``}
    </>
  ),
  iconUrl: "/assets/metric-commit-rate.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, from, to }) => {
    return `
    select 
   created,
   commit_rate, 
   commit_rate_smooth
   from (
    select 
      created
      , commit_rate
      , avg(commit_rate) over(order by created rows BETWEEN 59 PRECEDING AND CURRENT ROW) commit_rate_smooth
    from (
      select
        created
        , count() commit_rate
      from ${TelemetryTable.WAL}
      where ${tableId ? `tableId = ${tableId} and ` : ""}
      event = 103
      sample by ${sampleBy}
      FROM timestamp_floor('${sampleBy}', '${from}')
         TO timestamp_floor('${sampleBy}', '${to}')
      fill(0)
    )
    order by 1
    ${limit ? `limit ${limit}` : ""}
);
    `
  },
  // TODO: Sample, change!
  getQueryLastNotNull: (tableId) => `
select
  created
from ${TelemetryTable.WAL}
where ${tableId ? `tableId = ${tableId} and ` : ""}
event = 103
and physicalRowCount != null
limit -1
`,
  alignData: (data: CommitRate[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.created).getTime()),
    data.map((l) => sqlValueToFixed(l.commit_rate)),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
