import React from "react"
import uPlot from "uplot"
import type {Widget, WalRowThroughput} from "../types"
import {sqlValueToFixed, formatNumbers} from "../utils"
import {TelemetryTable} from "../../../../consts"

export const walRowThroughput: Widget = {
  distribution: 1,
  label: "WAL Row Throughput",
  chartTitle: "Row Processing Throughput",
  getDescription: () => (
    <>
      This chart displays rows processed per second during transaction merges. While similar to transaction throughput, this metric helps identify:

      <ul>
        <li>Data density variations within transactions</li>
        <li>Processing overhead for row-heavy transactions</li>
        <li>Resource utilization from row-level operations</li>
        <li>Impact of row complexity on merge performance</li>
      </ul>

      Use alongside transaction throughput to understand the relationship between transaction size and processing efficiency.    </>
  ),
  icon: "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n" +
    "    <path d=\"M61 43H52C52 42.45 51.55 42 51 42H39.17C38.46 39.39 37.38 38 36 38H6C3.25 38 2 43.7 2 49C2 54.3 3.25 60 6 60H36C37.37 60 38.46 58.61 39.17 56H54C54.55 56 55 55.55 55 55V52H57C57.55 52 58 51.55 58 51V49H61C61.55 49 62 48.55 62 48V44C62 43.45 61.55 43 61 43ZM35.98 40C36.11 40.04 36.6 40.51 37.08 42H34.9C35.31 40.72 35.75 40.07 35.97 40H35.98ZM6.01 58C5.65 57.9 4.89 56.56 4.42 54H10V52H4.14C4.05 51.1 4 50.1 4 49C4 47.9 4.05 46.9 4.14 46H18V44H4.42C4.89 41.44 5.65 40.1 6 40H33.57C32.7 41.75 32.22 44.39 32.06 46.94C32.02 47.6 32 48.29 32 49C32 49.71 32.02 50.4 32.06 51.06C32.22 53.61 32.69 56.25 33.57 58H6.01ZM36.01 58C35.77 57.93 35.32 57.28 34.91 56H37.08C36.6 57.5 36.12 57.97 36.01 58ZM52.99 54H34.41C34.3 53.41 34.21 52.74 34.14 52H53V54H52.99ZM55.99 50H34.02C34.01 49.67 33.99 49.35 33.99 49C33.99 48.65 34.01 48.33 34.02 48H35.99V46H34.13C34.2 45.26 34.3 44.59 34.4 44H49.98V46H37.98V48H55.98V50H55.99ZM59.99 47H57.99C57.99 46.45 57.54 46 56.99 46H51.99V45H59.99V47Z\" fill=\"url(#paint0_linear_56_708)\"/>\n" +
    "    <path d=\"M29 48H14V50H29V48Z\" fill=\"url(#paint1_linear_56_708)\"/>\n" +
    "    <path d=\"M12 48H10V50H12V48Z\" fill=\"url(#paint2_linear_56_708)\"/>\n" +
    "    <path d=\"M22 44H20V46H22V44Z\" fill=\"url(#paint3_linear_56_708)\"/>\n" +
    "    <path d=\"M14 52H12V54H14V52Z\" fill=\"url(#paint4_linear_56_708)\"/>\n" +
    "    <path d=\"M18 36C26.48 36 33.43 29.36 33.95 21H36V19H33.95C33.43 10.64 26.49 4 18 4C9.51 4 2 11.18 2 20C2 28.82 9.18 36 18 36ZM18 6C25.72 6 32 12.28 32 20C32 27.72 25.72 34 18 34C10.28 34 4 27.72 4 20C4 12.28 10.28 6 18 6Z\" fill=\"url(#paint5_linear_56_708)\"/>\n" +
    "    <path d=\"M52 20C52 19.45 51.55 19 51 19H38V21H50V36H52V20Z\" fill=\"url(#paint6_linear_56_708)\"/>\n" +
    "    <path d=\"M52 38H50V40H52V38Z\" fill=\"url(#paint7_linear_56_708)\"/>\n" +
    "    <path d=\"M12 28C12.14 28 12.29 27.97 12.42 27.91C12.77 27.75 13 27.39 13 27V26H20C20.55 26 21 25.55 21 25V22H23V23C23 23.39 23.22 23.74 23.58 23.91C23.71 23.97 23.86 24 24 24C24.23 24 24.46 23.92 24.64 23.77L30.64 18.77C30.87 18.58 31 18.3 31 18C31 17.7 30.87 17.42 30.64 17.23L24.64 12.23C24.34 11.98 23.93 11.93 23.58 12.09C23.23 12.25 23 12.61 23 13V14H16C15.45 14 15 14.45 15 15V18H13V17C13 16.61 12.78 16.26 12.42 16.09C12.07 15.93 11.66 15.98 11.36 16.23L5.36 21.23C5.13 21.42 5 21.7 5 22C5 22.3 5.13 22.58 5.36 22.77L11.36 27.77C11.54 27.92 11.77 28 12 28ZM17 16H24C24.51 16 24.93 15.62 24.99 15.13L28.44 18L24.99 20.87C24.93 20.38 24.51 20 24 20H21V19C21 18.45 20.55 18 20 18H17V16ZM11.01 24.87L7.56 22L11.01 19.13C11.07 19.62 11.49 20 12 20H19V24H12C11.49 24 11.07 24.38 11.01 24.87Z\" fill=\"url(#paint8_linear_56_708)\"/>\n" +
    "    <defs>\n" +
    "        <linearGradient id=\"paint0_linear_56_708\" x1=\"32\" y1=\"38\" x2=\"32\" y2=\"60\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint1_linear_56_708\" x1=\"21.5\" y1=\"48\" x2=\"21.5\" y2=\"50\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint2_linear_56_708\" x1=\"11\" y1=\"48\" x2=\"11\" y2=\"50\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint3_linear_56_708\" x1=\"21\" y1=\"44\" x2=\"21\" y2=\"46\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint4_linear_56_708\" x1=\"13\" y1=\"52\" x2=\"13\" y2=\"54\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint5_linear_56_708\" x1=\"19\" y1=\"4\" x2=\"19\" y2=\"36\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint6_linear_56_708\" x1=\"45\" y1=\"19\" x2=\"45\" y2=\"36\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint7_linear_56_708\" x1=\"51\" y1=\"38\" x2=\"51\" y2=\"40\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint8_linear_56_708\" x1=\"18\" y1=\"11.998\" x2=\"18\" y2=\"28\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "    </defs>\n" +
    "</svg>\n",
  isTableMetric: true,
  querySupportsRollingAppend: true,
  getQuery: ({tableId, sampleBySeconds, from, to}) => {
    return `
      select
          created time,
          sum(rowCount) numOfRowsApplied,
      from ${TelemetryTable.WAL}
      where ${tableId ? `tableId = ${tableId} and ` : ""}
      event = 105
      sample by ${sampleBySeconds}s FROM timestamp_floor('${sampleBySeconds}s', '${from}') TO timestamp_floor('${sampleBySeconds}s', '${to}') fill(0)
    `
  },
  alignData: (data: WalRowThroughput[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.time).getTime()),
    data.map((l) => l.numOfRowsApplied ? sqlValueToFixed(l.numOfRowsApplied) : 0,),
  ],
  mapYValue: (rawValue: number) => formatNumbers(rawValue),
}
