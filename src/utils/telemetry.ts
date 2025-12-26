import { getValue } from "./localStorage"
import { StoreKey } from "./localStorage/types"
import { API } from "../consts"
import {
  TelemetryConfigShape,
  TelemetryRemoteConfigShape,
} from "../store/Telemetry/types"
import { fromFetch } from "./fromFetch"
import { NEVER } from "rxjs"

const MAX_RETRIES_ENT = 3
const RETRY_BASE_DELAY_MS_ENT = 1000

export const sendServerInfoTelemetry = async (
  serverInfo: Readonly<TelemetryConfigShape>,
) => {
  const releaseType = getValue(StoreKey.RELEASE_TYPE)
  if (releaseType === "EE" || serverInfo?.enabled) {
    for (let attempt = 0; attempt <= MAX_RETRIES_ENT; attempt++) {
      try {
        const response = await fetch(`${API}/add-ent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...serverInfo, releaseType }),
        })
        if (response.ok) {
          return
        }
      } catch {
        // no-op, try again if not reached to max limit
      }
      if (attempt < MAX_RETRIES_ENT) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_DELAY_MS_ENT * Math.pow(2, attempt)),
        )
      }
    }
  }
}

export const getTelemetryTimestamp = (
  serverInfo: Readonly<TelemetryConfigShape> | undefined,
) => {
  if (serverInfo?.enabled) {
    return fromFetch<Partial<TelemetryRemoteConfigShape>>(
      `${API}/config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(serverInfo),
      },
      false,
    )
  }
  return NEVER
}
