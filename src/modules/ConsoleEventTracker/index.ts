import * as telemetryDb from "./db"
import { startPipeline, stopPipeline } from "./sendPipeline"
import type { TelemetryConfigShape } from "../../store/Telemetry/types"

const MAX_EVENTS = 10_000
const MAX_PENDING_EVENTS = 100

let started = false
let pending: Array<{ name: string; props?: string }> = []

export const trackEvent = async (
  name: string,
  payload?: Record<string, unknown>,
): Promise<void> => {
  try {
    const props = payload ? JSON.stringify(payload) : undefined
    if (!started) {
      if (pending.length < MAX_PENDING_EVENTS) pending.push({ name, props })
      return
    }
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

  const queued = pending
  pending = []
  for (const event of queued) {
    await telemetryDb.putEvent(event.name, event.props)
  }

  startPipeline(config)
}

export const stop = (): void => {
  stopPipeline()
  started = false
  pending = []
}
