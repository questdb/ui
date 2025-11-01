import { getValue } from "./localStorage";
import { StoreKey } from "./localStorage/types";
import { API } from "../consts";
import { TelemetryConfigShape, TelemetryRemoteConfigShape } from "../store/Telemetry/types";
import { fromFetch } from "./fromFetch";
import { NEVER } from "rxjs"

export const sendServerInfoTelemetry = (serverInfo: Readonly<TelemetryConfigShape>) => {
  const releaseType = getValue(StoreKey.RELEASE_TYPE);
  if (releaseType === "EE" || serverInfo?.enabled) {
    fetch(`${API}/add-ent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({...serverInfo, releaseType}),
    }).catch(() => {
    })
  }
}

export const getTelemetryTimestamp = (serverInfo: Readonly<TelemetryConfigShape> | undefined) => {
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
