import uPlot from "uplot"
import { MetricType } from "./utils"
import React from "react"

export type DateRange = {
  dateFrom: string
  dateTo: string
}

type MethodArgs = {
  tableId?: number
  sampleBySeconds?: number
  lastValue?: number | string
  limit?: number
  from?: string
  to?: string
}

export type Widget = {
  label: string
  chartTitle: string
  getDescription: ({ sampleBySeconds }: MethodArgs) => React.ReactNode
  icon: string
  isTableMetric: boolean
  /**
   * Scale distribution:
   * 1 - Linear
   * 2 - Ordinal
   * 3 - Logarithmic
   * 4 - ArcSinh
   * 100 - Custom
   */
  distribution: uPlot.Scale.Distr
  getQuery: ({
    tableId,
    sampleBySeconds,
    limit,
    from,
    to,
  }: MethodArgs) => string
  querySupportsRollingAppend: boolean
  alignData: (
    data: ResultType[MetricType][] | LastNotNull[],
  ) => uPlot.AlignedData
  mapYValue: (rawValue: number) => number | string
}

export type MetricsRefreshPayload = DateRange & {
  overwrite?: boolean
}

export type Duration = DateRange & {
  label: string
}

export type WallTransactionThroughout = {
  created: string
  commit_rate: string
}

export type TableWriteAmplification = {
  created: string
  writeAmplification: string
}

export type TableAverageTransactionSize = {
  created: string
  avg_rows: string
}

export type WalRowThroughput = {
  time: string
  numOfRowsApplied: string
}

export type WalTransactionLatency = {
  created: string
  latency: string
}

export type LastNotNull = {
  created: string
}

export type ResultType = {
  [MetricType.WAL_TRANSACTION_THROUGHPUT]: WallTransactionThroughout
  [MetricType.WAL_TRANSACTION_LATENCY]: WalTransactionLatency
  [MetricType.WAL_ROW_THROUGHPUT]: WalRowThroughput
  [MetricType.TABLE_WRITE_AMPLIFICATION]: TableWriteAmplification
  [MetricType.TABLE_AVERAGE_TRANSACTION_SIZE]: TableAverageTransactionSize
}
