import uPlot from "uplot"
import { Widget, durationInMinutes } from "../utils"
import type { CommitRate } from "../utils"
import { TelemetryTable } from "../../../../consts"
import { getTimeFilter, sqlValueToFixed, formatNumbers } from "./utils"

export const commitRate: Widget = {
  label: "Commit rate per second",
  iconUrl: "/assets/metric-commit-rate.svg",
  isTableMetric: true,
  getQuery: ({ tableId, metricDuration, sampleBy }) => {
    const minutes = durationInMinutes[metricDuration]
    return `
    select 
   created, 
   -- the chart can display both values for user convenience
   -- they may want to toggle these values on and off
   commit_rate, 
   commit_rate_smooth
   from (
    select 
      created
      , commit_rate
      -- here the value 59 refers to 1 min moving sum(), it is linked to sampling interval
      -- should the sampling interval change, the number of rows should be adjusted to cover 1 min window
      , avg(commit_rate) over(order by created rows BETWEEN 59 PRECEDING AND CURRENT ROW) commit_rate_smooth
    from (
      select -- calculates coarse commit_rate (commits per second)
        created
        , count() commit_rate
      from ${TelemetryTable.WAL}
      where ${tableId ? `tableId = ${tableId} and ` : ""}
      event = 103
      and ${getTimeFilter(minutes)}
      -- it is important this is 1s, should this value change
      -- the "commit_rate" value will have to be adjusted to rate/s
      sample by 1s 
      -- fill(0)
    )
    -- there is a bug in QuestDB, which does not sort the window dataset
    -- once the bug is fixed the order can be removed
    order by 1
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
  alignData: (rowsApplied: CommitRate[]): uPlot.AlignedData => [
    rowsApplied.map((l) => new Date(l.created).getTime()),
    rowsApplied.map((l) => sqlValueToFixed(l.commit_rate_smooth)),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
