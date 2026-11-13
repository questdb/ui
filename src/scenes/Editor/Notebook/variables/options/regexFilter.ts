import type { VariableOption } from "../../../../../store/notebook"
import { compileRegex, matchOption, stripDelimiters } from "../listOptions"

export const REGEX_FILTER_TIMEOUT_MS = 2_000
export const REGEX_FILTER_TIMEOUT_ERROR =
  "Regex filtering took too long. Use a simpler pattern."
const WORKER_UNAVAILABLE_ERROR = "Regex filtering needs Web Worker support."
const CANCELLED_ERROR = "Regex filtering was cancelled."

export type RegexFilterResult =
  | { kind: "ready"; options: VariableOption[] }
  | { kind: "error"; error: string }

type WorkerRequest = { source: string; options: VariableOption[] }

type WorkerResponse =
  | { success: true; options: VariableOption[] }
  | { success: false; error: string }

export const regexFilterWorkerSource = `
const matchOption = ${matchOption.toString()}
self.onmessage = (event) => {
  const { source, options } = event.data
  try {
    const regex = new RegExp(source)
    const matched = []
    for (const option of options) {
      const match = matchOption(option, regex)
      if (match) matched.push(match)
    }
    self.postMessage({ success: true, options: matched })
  } catch (error) {
    self.postMessage({ success: false, error: String(error) })
  }
}
`

const createWorker = (): { worker: Worker; url: string } | null => {
  const url = URL.createObjectURL(
    new Blob([regexFilterWorkerSource], { type: "application/javascript" }),
  )
  try {
    return { worker: new Worker(url), url }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

const runInWorker = (
  request: WorkerRequest,
  signal: AbortSignal,
): Promise<RegexFilterResult> =>
  new Promise((resolve) => {
    const created = createWorker()
    if (!created) {
      resolve({ kind: "error", error: WORKER_UNAVAILABLE_ERROR })
      return
    }
    const { worker, url } = created
    let settled = false
    const finish = (result: RegexFilterResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const onAbort = () => finish({ kind: "error", error: CANCELLED_ERROR })
    const timer = setTimeout(
      () => finish({ kind: "error", error: REGEX_FILTER_TIMEOUT_ERROR }),
      REGEX_FILTER_TIMEOUT_MS,
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
      finish(
        event.data.success
          ? { kind: "ready", options: event.data.options }
          : { kind: "error", error: event.data.error },
      )
    worker.onerror = (event) =>
      finish({
        kind: "error",
        error: `Regex filtering failed: ${event.message}`,
      })
    signal.addEventListener("abort", onAbort, { once: true })
    worker.postMessage(request)
  })

export const filterOptionsWithRegex = (
  options: VariableOption[],
  pattern: string | undefined,
  signal: AbortSignal,
): Promise<RegexFilterResult> => {
  if (!pattern || !compileRegex(pattern)) {
    return Promise.resolve({ kind: "ready", options })
  }
  if (typeof Worker === "undefined") {
    return Promise.resolve({ kind: "error", error: WORKER_UNAVAILABLE_ERROR })
  }
  if (signal.aborted) {
    return Promise.resolve({ kind: "error", error: CANCELLED_ERROR })
  }
  return runInWorker({ source: stripDelimiters(pattern), options }, signal)
}
