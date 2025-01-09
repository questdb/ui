import uPlot from "uplot"
import { MetricType } from "./utils"

export type Widget = {
  label: string
  description: string
  iconUrl: string
  isTableMetric: boolean
  getQuery: ({
    tableId,
    sampleBy,
    limit,
    timeFilter,
  }: {
    tableId?: number
    sampleBy: string
    limit?: number
    timeFilter?: string
  }) => string
  getQueryLastNotNull: (id?: number) => string
  querySupportsRollingAppend: boolean
  alignData: (data: any) => uPlot.AlignedData
  mapYValue: (rawValue: number) => string
}

export type MetricsRefreshPayload = {
  dateFrom: string
  dateTo: string
  overwrite?: boolean
}

export type Duration = {
  dateFrom: string
  dateTo: string
  label: string
}

export type CommitRate = {
  created: string
  commit_rate: string
  commit_rate_smooth: string
}

export type WriteAmplification = {
  created: string
  writeAmplification: string
}

export type RowsApplied = {
  time: string
  numOfWalApplies: string
  numOfRowsApplied: string
  numOfRowsWritten: string
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
