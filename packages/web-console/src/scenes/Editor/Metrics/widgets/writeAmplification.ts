import uPlot from "uplot"
import type { Widget } from "../utils"
import { WriteAmplification } from "../utils"
import {
  defaultSampleByForDuration,
  durationInMinutes,
  sqlValueToFixed,
  formatNumbers,
  getTimeFilter,
} from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeAmplification: Widget = {
  label: "Write amplification",
  iconUrl: "/assets/metric-write-amplification.svg",
  isTableMetric: true,
  getQuery: ({ tableId, metricDuration, sampleBy, limit }) => {
    const minutes = durationInMinutes[metricDuration]
    return `
select 
  created,
  -- coars, actual write amplification bucketed in 1s buckets
  phy_row_count/row_count writeAmplification
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
         and rowCount > 0 -- this is fixed clause, we have rows with - rowCount logged
         and ${getTimeFilter(minutes)}
      sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}      
      -- fill with null to avoid spurious values and division by 0
      fill(null,null)
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
    data.map((l) => sqlValueToFixed(l.writeAmplification)),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}