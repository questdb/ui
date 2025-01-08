import uPlot from "uplot"
import type { Widget } from "../utils"
import { sqlValueToFixed, formatNumbers } from "../utils"
import { CommitRate } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const commitRate: Widget = {
  label: "Commit rate",
  description:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio.",
  iconUrl: "/assets/metric-commit-rate.svg",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBy, limit, timeFilter }) => {
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
      -- it is important this is 1s, should this value change
      -- the "commit_rate" value will have to be adjusted to rate/s
      sample by ${sampleBy}
      ${timeFilter ? timeFilter : ""}
      fill(0)
    )
    -- there is a bug in QuestDB, which does not sort the window dataset
    -- once the bug is fixed the order can be removed
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
