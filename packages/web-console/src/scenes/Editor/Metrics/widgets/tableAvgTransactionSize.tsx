import React from "react"
import uPlot from "uplot"
import type { Widget, TableAverageTransactionSize } from "../types"
import { sqlValueToFixed } from "../utils"

export const tableAvgTransactionSize: Widget = {
  distribution: 1,
  label: "Average Transaction Size",
  chartTitle: "Average Transaction Size (rows/txn)",
  getDescription: () => (
    <>
      This chart tracks the mean size of transactions processed through the
      database API. While the database is optimized for both small and large
      transactions, larger batch sizes generally lead to better database
      performance. Monitor this metric to understand your API's transaction
      patterns and identify opportunities for batch size optimization. Key
      aspects to observe:
      <ul>
        <li>Transaction size trends and variations</li>
        <li>Any unusually small transactions that could be batched</li>
        <li>Consistency of batch sizes across time periods</li>
      </ul>
    </>
  ),
  icon:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24">\n' +
    "  <defs>\n" +
    '    <linearGradient id="dbGradient" x1="0%" y1="0%" x2="100%" y2="100%">\n' +
    '      <stop offset="0%" style="stop-color:#A5F3F9;stop-opacity:1" />\n' +
    '      <stop offset="12.5%" style="stop-color:#9AEEF4;stop-opacity:1" />\n' +
    '      <stop offset="25%" style="stop-color:#8FE7EF;stop-opacity:1" />\n' +
    '      <stop offset="37.5%" style="stop-color:#84E4EC;stop-opacity:1" />\n' +
    '      <stop offset="50%" style="stop-color:#77E1E9;stop-opacity:1" />\n' +
    '      <stop offset="62.5%" style="stop-color:#6FDCE6;stop-opacity:1" />\n' +
    '      <stop offset="75%" style="stop-color:#65D8E0;stop-opacity:1" />\n' +
    '      <stop offset="87.5%" style="stop-color:#61D4DC;stop-opacity:1" />\n' +
    '      <stop offset="100%" style="stop-color:#5CCFD7;stop-opacity:1" />\n' +
    "    </linearGradient>\n" +
    "  </defs>\n" +
    "\n" +
    "  <!-- Main database outline -->\n" +
    '  <path d="M4 5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5-2.69-2.5-6-2.5-6 1.12-6 2.5v12c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-12" fill="none" stroke="url(#dbGradient)" stroke-width="1.5"/>\n' +
    "  \n" +
    "  <!-- Concentric lines for database layers -->\n" +
    '  <path d="M4 9c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" fill="none" stroke="url(#dbGradient)" stroke-width="1.5"/>\n' +
    '  <path d="M4 13c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" fill="none" stroke="url(#dbGradient)" stroke-width="1.5"/>\n' +
    "  \n" +
    "  <!-- Arrow -->\n" +
    '  <path d="M22 8l2-2l2 2M22 16l2 2l2-2M24 6v12" fill="none" stroke="url(#dbGradient)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n' +
    "</svg>",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({ tableId, sampleBySeconds, from, to }) => {
    return `
      select
           created,
           avg(rowCount) avg_rows,
      from sys.telemetry_wal
      where ${tableId ? `tableId = ${tableId} ` : ""}
           and event = 105
      sample by ${sampleBySeconds}s FROM timestamp_floor('${sampleBySeconds}s', '${from}') TO timestamp_floor('${sampleBySeconds}s', '${to}') fill(0)
    `
  },
  alignData: (data: TableAverageTransactionSize[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.created).getTime()),
    data.map((l) => (l.avg_rows ? sqlValueToFixed(l.avg_rows) : 1)),
  ],
  mapYValue: (rawValue: number) => rawValue,
}
