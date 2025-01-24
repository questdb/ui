import React from "react"
import uPlot from "uplot"
import type { Widget, WriteAmplification } from "../types"
import { sqlValueToFixed } from "../utils"
import { TelemetryTable } from "../../../../consts"

export const writeAmplification: Widget = {
  distribution: 1,
  label: "Write amplification",
  getDescription: ({ lastValue, sampleBySeconds }) => (
    <>
      Ratio of rows physically written to disk against logical/queryable rows.
      If write amplification is higher than 1, this means data has been
      re-written several times. This will be higher during O3 writes.
      <br />
      {lastValue ? `Currently: ${lastValue} for the last ${sampleBySeconds}s` : ""}
    </>
  ),
  icon: "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n" +
    "    <path d=\"M61 14H3C2.73478 14 2.48043 14.1054 2.29289 14.2929C2.10536 14.4804 2 14.7348 2 15V49C2 49.2652 2.10536 49.5196 2.29289 49.7071C2.48043 49.8946 2.73478 50 3 50H61C61.2652 50 61.5196 49.8946 61.7071 49.7071C61.8946 49.5196 62 49.2652 62 49V15C62 14.7348 61.8946 14.4804 61.7071 14.2929C61.5196 14.1054 61.2652 14 61 14ZM4 48V42H8V40H4V39H8V37H4V36H8V34H4V33H8V31H4V30H8V28H4V27H8V25H4V24H8V22H4V16H60V18H53C52.7348 18 52.4804 18.1054 52.2929 18.2929C52.1054 18.4804 52 18.7348 52 19V45C52 45.2652 52.1054 45.5196 52.2929 45.7071C52.4804 45.8946 52.7348 46 53 46H60V48H4ZM60 23V24H56V26H60V27H56V29H60V30H56V32H60V33H56V35H60V38H56V40H60V41H56V43H60V44H54V20H60V21H56V23H60Z\" fill=\"url(#paint0_linear_56_720)\"/>\n" +
    "    <path d=\"M8 18H6V20H8V18Z\" fill=\"url(#paint1_linear_56_720)\"/>\n" +
    "    <path d=\"M8 44H6V46H8V44Z\" fill=\"url(#paint2_linear_56_720)\"/>\n" +
    "    <path d=\"M50 18H48V20H50V18Z\" fill=\"url(#paint3_linear_56_720)\"/>\n" +
    "    <path d=\"M50 44H48V46H50V44Z\" fill=\"url(#paint4_linear_56_720)\"/>\n" +
    "    <path d=\"M45 18H11C10.7348 18 10.4804 18.1054 10.2929 18.2929C10.1054 18.4804 10 18.7348 10 19V28C10 28.2652 10.1054 28.5196 10.2929 28.7071C10.4804 28.8946 10.7348 29 11 29H13C13.7956 29 14.5587 29.3161 15.1213 29.8787C15.6839 30.4413 16 31.2044 16 32C16 32.7956 15.6839 33.5587 15.1213 34.1213C14.5587 34.6839 13.7956 35 13 35H11C10.7348 35 10.4804 35.1054 10.2929 35.2929C10.1054 35.4804 10 35.7348 10 36V45C10 45.2652 10.1054 45.5196 10.2929 45.7071C10.4804 45.8946 10.7348 46 11 46H45C45.2652 46 45.5196 45.8946 45.7071 45.7071C45.8946 45.5196 46 45.2652 46 45V35H44V44H12V37H13C14.3261 37 15.5979 36.4732 16.5355 35.5355C17.4732 34.5979 18 33.3261 18 32C18 30.6739 17.4732 29.4021 16.5355 28.4645C15.5979 27.5268 14.3261 27 13 27H12V20H44V29H46V19C46 18.7348 45.8946 18.4804 45.7071 18.2929C45.5196 18.1054 45.2652 18 45 18Z\" fill=\"url(#paint5_linear_56_720)\"/>\n" +
    "    <path d=\"M46 31H44V33H46V31Z\" fill=\"url(#paint6_linear_56_720)\"/>\n" +
    "    <defs>\n" +
    "        <linearGradient id=\"paint0_linear_56_720\" x1=\"32\" y1=\"14\" x2=\"32\" y2=\"50\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint1_linear_56_720\" x1=\"7\" y1=\"18\" x2=\"7\" y2=\"20\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint2_linear_56_720\" x1=\"7\" y1=\"44\" x2=\"7\" y2=\"46\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint3_linear_56_720\" x1=\"49\" y1=\"18\" x2=\"49\" y2=\"20\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint4_linear_56_720\" x1=\"49\" y1=\"44\" x2=\"49\" y2=\"46\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint5_linear_56_720\" x1=\"28\" y1=\"18\" x2=\"28\" y2=\"46\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "        <linearGradient id=\"paint6_linear_56_720\" x1=\"45\" y1=\"31\" x2=\"45\" y2=\"33\" gradientUnits=\"userSpaceOnUse\">\n" +
    "            <stop stop-color=\"#8BE9FD\"/>\n" +
    "            <stop offset=\"1\" stop-color=\"#3EA0B4\"/>\n" +
    "        </linearGradient>\n" +
    "    </defs>\n" +
    "</svg>\n",
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
  alignData: (data: WriteAmplification[]): uPlot.AlignedData => [
    data.map((l) => new Date(l.created).getTime()),
    data.map((l) =>      l.writeAmplification ? sqlValueToFixed(l.writeAmplification) : 1,    ),
  ],
  mapYValue: (rawValue: number) => rawValue,
}
