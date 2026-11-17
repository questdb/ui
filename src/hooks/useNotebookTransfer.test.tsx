import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { useNotebookTransfer } from "./useNotebookTransfer"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import {
  requestTransferMonitor,
  stageTransferSnapshot,
} from "../utils/notebooks/notebookTransferState"
import { persistCellSnapshot } from "../scenes/Editor/Notebook/persistCellSnapshot"
import {
  createTransferCells,
  createTransferView,
} from "../utils/notebooks/notebookTransfer"

const mocks = vi.hoisted(() => ({
  buffers: [],
  addBuffer: vi.fn(),
  setActiveBuffer: vi.fn(),
  getById: vi.fn(),
  error: vi.fn(),
}))
vi.mock("../providers/EditorProvider", () => ({ useEditor: () => mocks }))
vi.mock("../components", () => ({ toast: { error: mocks.error } }))
vi.mock("../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../scenes/Editor/Notebook/persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))
vi.mock("../store/buffers", () => ({
  bufferStore: { getById: mocks.getById },
  MAX_BUFFER_NAME_LENGTH: 100,
}))
vi.mock("../utils/notebooks/notebookTransferState", () => ({
  requestTransferMonitor: vi.fn(),
  stageTransferSnapshot: vi.fn(),
}))
vi.mock("../utils/notebooks/notebookTransfer", () => ({
  createTransferCells: vi.fn(),
  createTransferView: vi.fn(),
}))
vi.mock("../scenes/Editor/Notebook/notebookUtils", () => ({
  buildPersistPayload: (cells: unknown) => ({ cells }),
}))

const request = {
  source: "result_grid" as const,
  queries: [{ sql: "select 1" }],
}
let renderer: ReactTestRenderer | undefined
const mount = () => {
  let hook!: ReturnType<typeof useNotebookTransfer>
  const Harness = () => {
    hook = useNotebookTransfer()
    return null
  }
  act(() => {
    renderer = create(<Harness />)
  })
  return () => hook
}
beforeEach(() => {
  vi.resetAllMocks()
  const buffer = {
    id: 42,
    label: "Notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [] },
  }
  mocks.addBuffer.mockResolvedValue(buffer)
  mocks.getById.mockResolvedValue(buffer)
  vi.mocked(createTransferCells).mockReturnValue([
    { id: "c1", position: 0, value: "select 1" },
  ])
  vi.mocked(createTransferView).mockImplementation((cells) => ({ cells }))
})
afterEach(() => {
  act(() => renderer?.unmount())
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("notebook transfer telemetry", () => {
  it("aborts a pending creation on logout and ignores its late response after a new login", async () => {
    const pending = deferred<unknown>()
    mocks.addBuffer.mockReturnValue(pending.promise)
    const hook = mount()
    let transfer!: Promise<void>
    act(() => {
      transfer = hook().transfer({ ...request, monitor: true })
    })
    const [, options] = mocks.addBuffer.mock.calls[0] as [
      unknown,
      { signal: AbortSignal },
    ]
    const signal = options.signal
    expect(signal.aborted).toBe(false)
    authSessionState.endSession()
    expect(signal.aborted).toBe(true)
    authSessionState.markNonSSOAuthenticated()
    await act(async () => {
      pending.resolve({ id: 42 })
      await transfer
    })
    expect(mocks.getById).not.toHaveBeenCalled()
    expect(persistCellSnapshot).not.toHaveBeenCalled()
    expect(mocks.setActiveBuffer).not.toHaveBeenCalled()
    expect(requestTransferMonitor).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(hook().busy).toBe(false)
  })

  it("stops after an in-flight snapshot save when the session ends", async () => {
    const pending = deferred<boolean>()
    vi.mocked(createTransferCells).mockReturnValue([
      {
        id: "c1",
        position: 0,
        value: "select 1",
        result: { results: [], timestamp: 1, activeResultIndex: 0 },
      },
      {
        id: "c2",
        position: 1,
        value: "select 2",
        result: { results: [], timestamp: 1, activeResultIndex: 0 },
      },
    ])
    vi.mocked(persistCellSnapshot).mockReturnValue(pending.promise)
    const hook = mount()
    let transfer!: Promise<void>
    await act(async () => {
      transfer = hook().transfer({ ...request, monitor: true })
      await Promise.resolve()
    })
    expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    // Creation was committed before logout; subsequent work must not be reported.
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_CREATE,
      expect.objectContaining({ notebookId: 42 }),
    )
    vi.mocked(trackEvent).mockClear()
    authSessionState.endSession()
    await act(async () => {
      pending.resolve(true)
      await transfer
    })
    expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    expect(stageTransferSnapshot).not.toHaveBeenCalled()
    expect(requestTransferMonitor).not.toHaveBeenCalled()
    expect(mocks.setActiveBuffer).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(hook().busy).toBe(false)
  })

  it("does not activate a target whose lookup completes after logout", async () => {
    const pending = deferred<unknown>()
    mocks.getById.mockReturnValue(pending.promise)
    const hook = mount()
    let transfer!: Promise<void>
    await act(async () => {
      transfer = hook().transfer(request)
      await Promise.resolve()
    })
    expect(mocks.getById).toHaveBeenCalledWith(42)
    vi.mocked(trackEvent).mockClear()
    authSessionState.endSession()
    await act(async () => {
      pending.resolve({ id: 42 })
      await transfer
    })
    expect(mocks.setActiveBuffer).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(hook().busy).toBe(false)
  })

  it("joins successful creation and transfer without duplicating generic opens", async () => {
    const hook = mount()
    await act(async () => {
      await hook().transfer(request)
    })
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.NOTEBOOK_CREATE, {
      source: "result_grid",
      notebookId: 42,
    })
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.NOTEBOOK_TRANSFER, {
      source: "result_grid",
      notebookId: 42,
      cellCount: 1,
      capturedResults: 0,
    })
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TAB_OPEN,
      expect.anything(),
    )
  })

  it("reports the tab limit without a misleading success or duplicate toast", async () => {
    mocks.addBuffer.mockResolvedValue(undefined)
    const hook = mount()
    await act(async () => {
      await hook().transfer(request)
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER_FAILED,
      expect.objectContaining({ stage: "create", reason: "tab_limit" }),
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER,
      expect.anything(),
    )
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it("records disappearance before activation instead of reporting success", async () => {
    mocks.getById.mockResolvedValue(undefined)
    const hook = mount()
    await act(async () => {
      await hook().transfer(request)
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER_FAILED,
      expect.objectContaining({
        notebookId: 42,
        stage: "activate",
        reason: "deleted",
      }),
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER,
      expect.anything(),
    )
  })

  it("reports activation errors with stage and sanitized reason", async () => {
    mocks.setActiveBuffer.mockRejectedValue(
      new DOMException("private SQL", "QuotaExceededError"),
    )
    const hook = mount()
    await act(async () => {
      await hook().transfer(request)
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER_FAILED,
      {
        notebookId: 42,
        source: "result_grid",
        stage: "activate",
        reason: "storage_quota",
      },
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER,
      expect.anything(),
    )
  })

  it("reports a soft result-save failure even when the live transfer succeeds", async () => {
    vi.mocked(createTransferCells).mockReturnValue([
      {
        id: "c1",
        position: 0,
        value: "select 1",
        result: { results: [], activeResultIndex: 0, timestamp: 1 },
      },
    ])
    vi.mocked(persistCellSnapshot).mockResolvedValue(false)
    const hook = mount()
    await act(async () => {
      await hook().transfer(request)
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER_FAILED,
      expect.objectContaining({
        notebookId: 42,
        stage: "persist_results",
        reason: "result_not_saved",
      }),
    )
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TRANSFER,
      expect.objectContaining({ notebookId: 42 }),
    )
  })
})
