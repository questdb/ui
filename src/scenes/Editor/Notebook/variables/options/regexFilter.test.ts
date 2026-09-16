import { runInNewContext } from "node:vm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VariableOption } from "../../../../../store/notebook"
import {
  filterOptionsWithRegex,
  REGEX_FILTER_TIMEOUT_ERROR,
  REGEX_FILTER_TIMEOUT_MS,
  regexFilterWorkerSource,
} from "./regexFilter"

const options = (...values: string[]): VariableOption[] =>
  values.map((value) => ({ value, label: value }))

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  request: unknown = null
  terminate = vi.fn()

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(request: unknown) {
    this.request = request
  }

  respond(data: unknown) {
    this.onmessage?.({ data })
  }
}

const lastWorker = () => FakeWorker.instances[FakeWorker.instances.length - 1]

const runWorkerSource = (data: unknown) => {
  const posted: unknown[] = []
  const self = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: unknown) => posted.push(message),
  }
  runInNewContext(regexFilterWorkerSource, { self })
  self.onmessage?.({ data })
  return posted[0]
}

describe("filterOptionsWithRegex", () => {
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal("Worker", FakeWorker)
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:regex-filter",
      revokeObjectURL,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns the options unchanged without a pattern and creates no worker", async () => {
    // When
    const result = await filterOptionsWithRegex(
      options("EURUSD"),
      undefined,
      new AbortController().signal,
    )

    // Then
    expect(result).toEqual({ kind: "ready", options: options("EURUSD") })
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it("returns the options unchanged for an invalid pattern", async () => {
    // When
    const result = await filterOptionsWithRegex(
      options("EURUSD"),
      "(",
      new AbortController().signal,
    )

    // Then
    expect(result).toEqual({ kind: "ready", options: options("EURUSD") })
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it("sends the bare pattern to the worker and resolves with its result", async () => {
    // Given
    const pending = filterOptionsWithRegex(
      options("EURUSD", "GBPJPY"),
      "/USD$/",
      new AbortController().signal,
    )
    const worker = lastWorker()

    // When
    worker.respond({ success: true, options: options("EURUSD") })

    // Then
    expect(worker.request).toEqual({
      source: "USD$",
      options: options("EURUSD", "GBPJPY"),
    })
    await expect(pending).resolves.toEqual({
      kind: "ready",
      options: options("EURUSD"),
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:regex-filter")
  })

  it("terminates a silent worker and reports a timeout", async () => {
    // Given
    const pending = filterOptionsWithRegex(
      options("EURUSD"),
      "(a+)+$",
      new AbortController().signal,
    )

    // When
    vi.advanceTimersByTime(REGEX_FILTER_TIMEOUT_MS)

    // Then
    await expect(pending).resolves.toEqual({
      kind: "error",
      error: REGEX_FILTER_TIMEOUT_ERROR,
    })
    expect(lastWorker().terminate).toHaveBeenCalledOnce()
  })

  it("terminates the worker on abort and ignores a late response", async () => {
    // Given
    const controller = new AbortController()
    const pending = filterOptionsWithRegex(
      options("EURUSD"),
      "USD$",
      controller.signal,
    )
    const worker = lastWorker()

    // When
    controller.abort()
    worker.respond({ success: true, options: options("EURUSD") })

    // Then
    await expect(pending).resolves.toEqual({
      kind: "error",
      error: "Regex filtering was cancelled.",
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("reports an error when workers are unavailable", async () => {
    // Given
    vi.stubGlobal("Worker", undefined)

    // When
    const result = await filterOptionsWithRegex(
      options("EURUSD"),
      "USD$",
      new AbortController().signal,
    )

    // Then
    expect(result).toEqual({
      kind: "error",
      error: "Regex filtering needs Web Worker support.",
    })
  })
})

describe("regexFilterWorkerSource", () => {
  it("filters and transforms options with capture groups", () => {
    // When
    const response = runWorkerSource({
      source: "^(?<text>\\w{3})(?<value>USD)$",
      options: options("EURUSD", "GBPJPY", "AUDUSD"),
    })

    // Then
    expect(response).toEqual({
      success: true,
      options: [
        { value: "USD", label: "EUR" },
        { value: "USD", label: "AUD" },
      ],
    })
  })

  it("posts a compile error instead of throwing", () => {
    expect(
      runWorkerSource({ source: "(", options: options("EURUSD") }),
    ).toMatchObject({ success: false })
  })
})
