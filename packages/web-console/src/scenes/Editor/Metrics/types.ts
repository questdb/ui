import uPlot from "uplot"
import { MetricType } from "./utils"
import React from "react";

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
  getQuery: ({ tableId, sampleBySeconds, limit, from, to }: MethodArgs) => string
  querySupportsRollingAppend: boolean
  alignData: (data: any) => uPlot.AlignedData
  mapYValue: (rawValue: number) => number | string
}

export type MetricsRefreshPayload = DateRange & {
  overwrite?: boolean
}

export type Duration = DateRange & {
  label: string
}

export type CommitRate = {
  created: string
  commit_rate: string
}

export type WriteAmplification = {
  created: string
  writeAmplification: string
}

export type RowsApplied = {
  time: string
  numOfRowsApplied: string
  avgWalAmplification: string
}

export type Latency = {
  created: string
  latency: string
}

export type LastNotNull = {
  created: string
}

export type ResultType = {
  [MetricType.COMMIT_RATE]: CommitRate
  [MetricType.LATENCY]: Latency
  [MetricType.WRITE_THROUGHPUT]: RowsApplied
  [MetricType.WRITE_AMPLIFICATION]: RowsApplied
}
