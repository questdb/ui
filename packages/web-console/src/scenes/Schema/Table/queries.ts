export const rowsApplied = (id: string) => `
select
    created time,
    count(rowCount) numOfWalApplies,
    sum(rowCount) numOfRowsApplied,
    sum(physicalRowCount) numOfRowsWritten,
    avg(physicalRowCount/rowCount) avgWalAmplification
from sys.telemetry_wal
where tableId = ${id}
and event = 105
and created > date_trunc('minute', dateadd('d', -1, now()))
and created < date_trunc('minute', now())
sample by 1m`

export const latency = (id: string) => `
select
    created time,
    count(latency) / 2 numOfWalApplies,
    avg(latency) * 2 avg_latency
from sys.telemetry_wal
where tableId = ${id}
and (event = 105 or event = 103)
and created > date_trunc('minute', dateadd('d', -1, now()))
and created < date_trunc('minute', now())
sample by 1m
`
