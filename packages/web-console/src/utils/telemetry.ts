import { getValue } from "./localStorage";
import { StoreKey } from "./localStorage/types";
import { API } from "../consts";
import { TelemetryConfigShape } from "../store/Telemetry/types";

export const sendEntTelemetry = (config: Readonly<TelemetryConfigShape>) => {
  const releaseType = getValue(StoreKey.RELEASE_TYPE);
  if (releaseType === "EE" || config?.enabled) {
    fetch(`${API}/add-ent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({...config, releaseType}),
    }).catch(() => {
    })
  }
}
