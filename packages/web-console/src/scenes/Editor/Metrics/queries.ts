import {
  MetricDuration,
  SampleBy,
  minutesToDays,
  minutesToHours,
  mappedSampleBy,
  durationInMinutes,
} from "./utils"

export const rowsApplied = (
  id: number,
  metricDuration: MetricDuration,
  sampleBy?: SampleBy,
) => {
  const minutes = durationInMinutes[metricDuration]

  return `
select
    created time,
    count(rowCount) numOfWalApplies,
    sum(rowCount) numOfRowsApplied,
    sum(physicalRowCount) numOfRowsWritten,
    avg(physicalRowCount/rowCount) avgWalAmplification
from sys.telemetry_wal
where tableId = ${id}
and event = 105
and created > date_trunc('minute', dateadd('${minutes >= 1440 ? "d" : "h"}', -${
    minutes >= 1440 ? minutesToDays(minutes) : minutesToHours(minutes)
  }, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? mappedSampleBy[metricDuration]}`
}

export const latency = (
  id: number,
  metricDuration: MetricDuration,
  sampleBy?: SampleBy,
) => {
  const minutes = durationInMinutes[metricDuration]
  return `
select
    created time,
    count(latency) / 2 numOfWalApplies,
    avg(latency) * 2 avg_latency
from sys.telemetry_wal
where tableId = ${id}
and (event = 105 or event = 103)
and created > date_trunc('minute', dateadd('${minutes >= 1440 ? "d" : "h"}', -${
    minutes >= 1440 ? minutesToDays(minutes) : minutesToHours(minutes)
  }, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? mappedSampleBy[metricDuration]}
`
}
