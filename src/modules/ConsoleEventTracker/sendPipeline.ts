import Bowser from "bowser"
import { API as DEFAULT_API } from "../../consts"

const API: string =
  (import.meta.env.VITE_TELEMETRY_DEV as string) || DEFAULT_API
import { StoreKey } from "../../utils/localStorage/types"
import * as telemetryDb from "./db"
import type { TelemetryConfigShape } from "../../store/Telemetry/types"

const MAX_BATCH_SIZE = 1_000
const MAX_RETRIES = 9
const BASE_DELAY = 1_000

let config: TelemetryConfigShape | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

const getClientId = (): string => {
  try {
    let clientId = localStorage.getItem(StoreKey.CLIENT_ID)
    if (!clientId) {
      clientId = crypto.randomUUID()
      localStorage.setItem(StoreKey.CLIENT_ID, clientId)
    }
    return clientId
  } catch {
    // localStorage unavailable — session-only ID
    return crypto.randomUUID()
  }
}

const checkLatest = async (
  id: string,
  clientId: string,
): Promise<{ ok: boolean; status: number; cursor: number }> => {
  const response = await fetch(`${API}/console-events-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, client_id: clientId }),
  })

  if (!response.ok) {
    return { ok: false, status: response.status, cursor: 0 }
  }

  const data = (await response.json()) as { lastUpdated?: string }
  const cursor = data.lastUpdated ? new Date(data.lastUpdated).getTime() : 0
  if (isNaN(cursor)) {
    return { ok: false, status: 422, cursor: 0 }
  }
  return { ok: true, status: response.status, cursor }
}

const getBrowserInfo = (): {
  browser?: string
  browser_version?: string
  client_os?: string
} => {
  if (typeof navigator === "undefined") return {}

  const parsed = Bowser.parse(navigator.userAgent)

  return {
    browser: parsed.browser.name,
    browser_version: parsed.browser.version,
    client_os: parsed.os.name,
  }
}

const sendEntries = async (
  entries: Array<{ created: number; name: string; props?: string }>,
  clientId: string,
): Promise<{ ok: boolean; status: number }> => {
  if (!config) return { ok: false, status: 0 }

  const { browser, browser_version, client_os } = getBrowserInfo()
  const consoleVersion = String(import.meta.env.CONSOLE_VERSION ?? "")

  const response = await fetch(`${API}/add-console-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: config.id,
      client_id: clientId,
      version: config.version,
      console_version: consoleVersion,
      ...(client_os ? { client_os } : {}),
      ...(browser ? { browser } : {}),
      ...(browser_version ? { browser_version } : {}),
      events: entries.map((e) => ({
        name: e.name,
        ...(e.props ? { props: e.props } : {}),
        created: e.created,
      })),
    }),
  })

  return { ok: response.ok, status: response.status }
}

let backoff = async (attempt: number): Promise<void> => {
  if (attempt === 0) return
  const delay = BASE_DELAY * 2 ** (attempt - 1)
  await new Promise((r) => setTimeout(r, delay))
}

let stopped = false
let ongoing = false
let checkAttempt = 0
let sendAttempt = 0

const run = async (): Promise<void> => {
  if (!config?.id || ongoing) return
  ongoing = true
  let sent = false
  const clientId = getClientId()

  while (!sent && !stopped) {
    const attempt = Math.max(checkAttempt, sendAttempt)
    await backoff(attempt)

    let cursor: number | null = null
    try {
      const { ok, status, cursor: c } = await checkLatest(config.id, clientId)
      if (!ok) {
        throw new Error(`checkLatest failed with ${status}`)
      }
      cursor = c
      checkAttempt = 0
    } catch (e) {
      console.error("checkLatest failed", e)
      checkAttempt++
      if (checkAttempt > MAX_RETRIES) break
      continue
    }
    if (stopped) break

    const entries = await telemetryDb.getEntriesAfter(cursor, MAX_BATCH_SIZE)
    if (entries.length === 0 || stopped) break

    try {
      const { ok, status } = await sendEntries(entries, clientId)
      if (!ok) {
        throw new Error(`sendEntries failed with ${status}`)
      }
      sendAttempt = 0
    } catch (e) {
      console.error("sendEntries failed", e)
      sendAttempt++
      if (sendAttempt > MAX_RETRIES) break
      continue
    }
    if (stopped) break

    const lastSentCreated = entries[entries.length - 1].created
    await telemetryDb.deleteEntriesUpTo(lastSentCreated)
    sent = true
  }
  if (checkAttempt > MAX_RETRIES || sendAttempt > MAX_RETRIES) {
    stopPipeline()
  }
  ongoing = false
}

export const startPipeline = (telemetryConfig: TelemetryConfigShape): void => {
  config = telemetryConfig
  stopped = false
  ongoing = false
  checkAttempt = 0
  sendAttempt = 0
  void run()
  intervalId = setInterval(async () => {
    const events = await telemetryDb.getEntryCount()
    if (events === 0) return
    void run()
  }, 5_000)
}

export const stopPipeline = (): void => {
  stopped = true
  config = null
  ongoing = false
  checkAttempt = 0
  sendAttempt = 0
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// Exported for testing
export const _internals = {
  getClientId,
  checkLatest,
  sendEntries,
  run,
  get backoff() {
    return backoff
  },
  set backoff(fn: typeof backoff) {
    backoff = fn
  },
  MAX_RETRIES,
  get checkAttempt() {
    return checkAttempt
  },
  get sendAttempt() {
    return sendAttempt
  },
  get stopped() {
    return stopped
  },
  resetState: () => {
    stopped = false
    ongoing = false
    checkAttempt = 0
    sendAttempt = 0
    config = null
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  },
  setConfig: (c: TelemetryConfigShape) => {
    config = c
  },
}
