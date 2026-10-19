import { TelemetryTable } from "../consts"
import type { TelemetryConfigShape } from "../store/Telemetry/types"
import type { Client } from "./questdb/client"
import type { Options } from "./questdb/types"

// Housekeeping must not renew an idle login or count as user execution.
export const TELEMETRY_QUERY_OPTIONS = {
  refreshAuth: false,
  background: true,
} as const satisfies Options

// Shared by startup telemetry and the instance-settings save path.
export const queryTelemetryConfig = (quest: Pick<Client, "query">) =>
  quest.query<TelemetryConfigShape>(
    `${TelemetryTable.CONFIG} limit -1`,
    TELEMETRY_QUERY_OPTIONS,
  )
