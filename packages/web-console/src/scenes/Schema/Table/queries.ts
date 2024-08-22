import {
  durationInMinutes,
  MetricDuration,
} from "./../../../modules/Graph/types"

const minutesToDays = (durationInMinutes: number) => durationInMinutes / 60 / 24

export enum SampleBy {
  ONE_MINUTE = "1m",
  FIFTEEN_MINUTES = "15m",
  ONE_HOUR = "1h",
}

export const mappedSampleBy: Record<MetricDuration, SampleBy> = {
  [MetricDuration.TEN_MINUTES]: SampleBy.ONE_MINUTE,
  [MetricDuration.THIRTY_MINUTES]: SampleBy.ONE_MINUTE,
  [MetricDuration.ONE_HOUR]: SampleBy.ONE_MINUTE,
  [MetricDuration.THREE_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.SIX_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.TWELVE_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.TWENTY_FOUR_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.THREE_DAYS]: SampleBy.ONE_HOUR,
  [MetricDuration.SEVEN_DAYS]: SampleBy.ONE_HOUR,
}

export const rowsApplied = (
  id: string,
  metricDuration: MetricDuration,
  sampleBy?: SampleBy,
) => `
select
    created time,
    count(rowCount) numOfWalApplies,
    sum(rowCount) numOfRowsApplied,
    sum(physicalRowCount) numOfRowsWritten,
    avg(physicalRowCount/rowCount) avgWalAmplification
from sys.telemetry_wal
where tableId = ${id}
and event = 105
and created > date_trunc('minute', dateadd('d', -${minutesToDays(
  durationInMinutes[metricDuration],
)}, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? mappedSampleBy[metricDuration]}`

export const latency = (
  id: string,
  metricDuration: MetricDuration,
  sampleBy?: SampleBy,
) => `
select
    created time,
    count(latency) / 2 numOfWalApplies,
    avg(latency) * 2 avg_latency
from sys.telemetry_wal
where tableId = ${id}
and (event = 105 or event = 103)
and created > date_trunc('minute', dateadd('d', -${minutesToDays(
  durationInMinutes[metricDuration],
)}, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? mappedSampleBy[metricDuration]}
`
