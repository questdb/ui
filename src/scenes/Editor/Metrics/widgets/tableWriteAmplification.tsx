import React from "react"
import uPlot from "uplot"
import type { Widget, TableWriteAmplification } from "../types"
import { sqlValueToFixed } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const tableWriteAmplification: Widget = {
  distribution: 1,
  label: "Table Write Amplification",
  chartTitle: "Write Amplification",
  getDescription: () => (
    <>
      This chart tracks the data write overhead during merge operations. Write
      amplification occurs when:
      <ul>
        <li>Copy-on-write operations affect large data blocks</li>
        <li>Datasets are re-ingested for deduplication</li>
        <li>Data requires extensive rewriting during merges</li>
      </ul>
      Scale ranges from optimal (1x) to problematic (1000x+). High amplification
      typically indicates duplicate data ingestion or suboptimal data ordering
      patterns.
    </>
  ),
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    return `
      select
        created,
        COALESCE(phy_row_count / row_count,0) writeAmplification
      from
        (
            select
              created,
              sum(rowcount) row_count,
              sum(physicalRowCount) phy_row_count,
            from ${TelemetryTable.WAL}
            where 
              ${tableId ? `tableId = ${tableId} ` : ""}
              and event = 105
              and rowCount > 0 
            sample by ${sampleBySeconds}s FROM timestamp_floor('${sampleBySeconds}s', '${from}') TO timestamp_floor('${sampleBySeconds}s', '${to}') fill(0,0)
        );
    `
  },
  alignData: (data): uPlot.AlignedData => {
    const rows = data as TableWriteAmplification[]
    return [
      rows.map((l) => new Date(l.created).getTime()),
      rows.map((l) =>
        l.writeAmplification ? sqlValueToFixed(l.writeAmplification) : 1,
      ),
    ]
  },
  mapYValue: (rawValue: number) => rawValue,
}
