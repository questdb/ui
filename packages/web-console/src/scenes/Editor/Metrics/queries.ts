import { TelemetryTable } from "./../../../consts"
import {
  MetricDuration,
  SampleBy,
  minutesToDays,
  minutesToHours,
  defaultSampleByForDuration,
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
    coalesce(avg(physicalRowCount/rowCount), 1) avgWalAmplification
from ${TelemetryTable.WAL}
where tableId = ${id}
and event = 105
and created > date_trunc('minute', dateadd('${minutes >= 1440 ? "d" : "h"}', -${
    minutes >= 1440 ? minutesToDays(minutes) : minutesToHours(minutes)
  }, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}`
}

export const rowsAppliedLastNotNull = (id: number) => `
select
  created
from ${TelemetryTable.WAL}
where tableId = ${id} 
and event = 105
and rowCount != null
and physicalRowCount != null
limit -1
`

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
from ${TelemetryTable.WAL}
where tableId = ${id}
and (event = 105 or event = 103)
and created > date_trunc('minute', dateadd('${minutes >= 1440 ? "d" : "h"}', -${
    minutes >= 1440 ? minutesToDays(minutes) : minutesToHours(minutes)
  }, now()))
and created < date_trunc('minute', now())
sample by ${sampleBy ?? defaultSampleByForDuration[metricDuration]}
`
}

export const latencyLastNotNull = (id: number) => `
select
  created
from ${TelemetryTable.WAL}
where tableId = ${id} 
and (event = 105 or event = 103)
and latency != null
limit -1
`
