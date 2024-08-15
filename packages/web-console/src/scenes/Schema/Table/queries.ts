import { durationInMinutes } from "./../../../modules/Graph/types"
import { MetricDuration } from "modules/Graph/types"

const minutesToDays = (durationInMinutes: number) => durationInMinutes / 60 / 24

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
sample by 1m`

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
sample by 1m
`
