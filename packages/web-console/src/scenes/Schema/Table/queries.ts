import {
  durationInMinutes,
  MetricDuration,
} from "./../../../modules/Graph/types"

const minutesToDays = (durationInMinutes: number) => durationInMinutes / 60 / 24

export const mappedSampleBy: Record<MetricDuration, string> = {
  [MetricDuration.TEN_MINUTES]: "1m",
  [MetricDuration.THIRTY_MINUTES]: "1m",
  [MetricDuration.ONE_HOUR]: "1m",
  [MetricDuration.THREE_HOURS]: "1m",
  [MetricDuration.SIX_HOURS]: "15m",
  [MetricDuration.TWELVE_HOURS]: "15m",
  [MetricDuration.TWENTY_FOUR_HOURS]: "15m",
  [MetricDuration.THREE_DAYS]: "1h",
  [MetricDuration.SEVEN_DAYS]: "1h",
}

export const rowsApplied = (id: string, metricDuration: MetricDuration) => `
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
sample by ${mappedSampleBy[metricDuration]}`

export const latency = (id: string, metricDuration: MetricDuration) => `
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
sample by ${mappedSampleBy[metricDuration]}
`
