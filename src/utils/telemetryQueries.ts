import { TelemetryTable } from "../consts"
import type { TelemetryConfigShape } from "../store/Telemetry/types"
import type { Client } from "./questdb/client"
import type { Options } from "./questdb/types"

// Housekeeping must not renew an idle login or count as user execution.
export const TELEMETRY_QUERY_OPTIONS = {
  refreshAuth: false,
  background: true,
} as const satisfies Options

// The startup read runs once per console, right after the auth check, like
// the build version read: the login is not idle, and nothing retries the read.
// Refused near expiry or after a failed renewal (e.g. every login of a token
// that lives under 30 seconds), it would leave Metrics unavailable until the
// next login. So it may renew the session like the console's other reads.
export const TELEMETRY_STARTUP_QUERY_OPTIONS = {
  background: true,
} as const satisfies Options

// Shared by startup telemetry and the instance-settings save path.
export const queryTelemetryConfig = (
  quest: Pick<Client, "query">,
  options: Options = TELEMETRY_QUERY_OPTIONS,
) =>
  quest.query<TelemetryConfigShape>(
    `${TelemetryTable.CONFIG} limit -1`,
    options,
  )
