import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { editor } from "monaco-editor"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { RunningType } from "../../../store/Query/types"
import { appendQuery } from "./utils"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"

vi.mock("./utils", () => ({ appendQuery: vi.fn() }))

const fakeEditor = {} as editor.IStandaloneCodeEditor

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("registerLegacyEventBusEvents MSG_QUERY_FIND_N_EXEC", () => {
  let cleanup: () => void
  let previewing: boolean
  let running: RunningType
  const toggleRunning = vi.fn()
  const openQueryInNewTab = vi.fn<[query: string], Promise<boolean>>()

  beforeEach(() => {
    vi.mocked(appendQuery).mockReset()
    toggleRunning.mockReset()
    openQueryInNewTab.mockReset().mockResolvedValue(true)
    previewing = false
    running = RunningType.NONE
    cleanup = registerLegacyEventBusEvents({
      editor: fakeEditor,
      toggleRunning,
      getRunning: () => running,
      isPreviewing: () => previewing,
      openQueryInNewTab,
    })
  })

  afterEach(() => cleanup())

  it("appends to an open tab and runs it", async () => {
    // When
    eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, { query: '"t.csv"' })
    await flush()

    // Then
    expect(appendQuery).toHaveBeenCalledWith(fakeEditor, '"t.csv";')
    expect(openQueryInNewTab).not.toHaveBeenCalled()
    expect(toggleRunning).toHaveBeenCalledTimes(1)
  })

  it("opens the query in a new tab and runs it there while a closed tab is previewed", async () => {
    // Given
    previewing = true
    let resolveOpen: (opened: boolean) => void = () => undefined
    openQueryInNewTab.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve
      }),
    )

    // When
    eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, { query: '"t.csv"' })

    // Then: nothing touches the read-only preview, and the run waits for the new tab
    expect(appendQuery).not.toHaveBeenCalled()
    expect(openQueryInNewTab).toHaveBeenCalledWith('"t.csv";')
    expect(toggleRunning).not.toHaveBeenCalled()

    resolveOpen(true)
    await flush()
    expect(toggleRunning).toHaveBeenCalledTimes(1)
  })

  it("does not run anything when the new tab could not be opened", async () => {
    // Given
    previewing = true
    openQueryInNewTab.mockResolvedValue(false)

    // When
    eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, { query: '"t.csv"' })
    await flush()

    // Then
    expect(appendQuery).not.toHaveBeenCalled()
    expect(toggleRunning).not.toHaveBeenCalled()
  })

  it("does not start a second run while a query is already running", async () => {
    // Given
    previewing = true
    running = RunningType.QUERY

    // When
    eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, { query: '"t.csv"' })
    await flush()

    // Then
    expect(openQueryInNewTab).toHaveBeenCalledTimes(1)
    expect(toggleRunning).not.toHaveBeenCalled()
  })
})
