import * as telemetryDb from "./db"
import { startPipeline, stopPipeline } from "./sendPipeline"
import type { TelemetryConfigShape } from "../../store/Telemetry/types"

const MAX_EVENTS = 10_000

let started = false

export const trackEvent = async (
  name: string,
  payload?: Record<string, unknown>,
): Promise<void> => {
  if (!started) return
  try {
    const props = payload ? JSON.stringify(payload) : undefined
    await telemetryDb.putEvent(name, props)
  } catch {
    console.error("Could not track event in IndexedDB:", name)
  }
}

export const start = async (config: TelemetryConfigShape): Promise<void> => {
  if (started) return
  if (
    import.meta.env.MODE === "development" &&
    !import.meta.env.VITE_TELEMETRY_DEV
  )
    return
  started = true

  await telemetryDb.trimToMaxRows(MAX_EVENTS)

  startPipeline(config)
}

export const stop = (): void => {
  stopPipeline()
  started = false
}
