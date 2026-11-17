import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { useMonitoringDashboard } from "./useMonitoringDashboard"
import type { Buffer } from "../store/buffers"
import type {
  MonitoringOpenResult,
  MonitoringRequest,
} from "../utils/monitoring/openDashboard"

const mocks = vi.hoisted(() => ({
  editor: {
    addBuffer: vi.fn(),
    setActiveBuffer: vi.fn(),
    updateBuffer: vi.fn(),
    tabsDisabled: false,
  },
  openDashboard: vi.fn(),
  getById: vi.fn(),
  error: vi.fn(),
}))
vi.mock("../providers/EditorProvider", () => ({
  useEditor: () => mocks.editor,
}))
vi.mock("../utils/monitoring/openDashboard", () => ({
  openMonitoringDashboard: mocks.openDashboard,
}))
vi.mock("../store/buffers", () => ({
  bufferStore: { getById: mocks.getById },
}))
vi.mock("../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../components/Toast", () => ({ toast: { error: mocks.error } }))

const request: MonitoringRequest = {
  target: { instanceKey: "instance", kind: "table", name: "trades" },
  telemetryEnabled: true,
  walEnabled: true,
}
const buffer: Buffer = {
  id: 1,
  label: "trades · monitoring",
  value: "",
  position: 0,
  notebookViewState: {
    cells: [{ id: "health", position: 0, value: "select 1" }],
  },
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let renderer: ReactTestRenderer | undefined
const mount = () => {
  let hook!: ReturnType<typeof useMonitoringDashboard>
  const Harness = () => {
    hook = useMonitoringDashboard()
    return null
  }
  act(() => {
    renderer = create(<Harness />)
  })
  return () => hook
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(buffer)
  mocks.openDashboard
    .mockResolvedValue({ buffer, outcome: "reused" })
    .mockResolvedValueOnce({ buffer, outcome: "created" })
})
afterEach(() => {
  act(() => renderer?.unmount())
})

describe("monitoring dashboard opening lock", () => {
  it("ignores repeated clicks until the dashboard is activated, then unlocks", async () => {
    const activation = deferred<void>()
    mocks.editor.setActiveBuffer.mockReturnValueOnce(activation.promise)
    const hook = mount()
    const onOpened = vi.fn()
    let initial!: Promise<void>
    await act(async () => {
      initial = hook().open(request, () => true, onOpened)
      await hook().open(request, () => true, onOpened)
    })
    expect(hook().busy).toBe(true)
    expect(mocks.openDashboard).toHaveBeenCalledTimes(1)

    await act(async () => {
      activation.resolve()
      await initial
    })
    expect(onOpened).toHaveBeenCalledTimes(1)
    expect(hook().busy).toBe(false)

    await act(async () => {
      await hook().open(request, () => true, onOpened)
    })
    expect(onOpened).toHaveBeenCalledTimes(2)
    expect(mocks.openDashboard).toHaveBeenCalledTimes(2)
  })

  it("does not unlock a later opening when an earlier one finishes", async () => {
    const activation = deferred<void>()
    mocks.editor.setActiveBuffer.mockReturnValueOnce(activation.promise)
    const hook = mount()
    let initial!: Promise<void>
    act(() => {
      initial = hook().open(request, () => true, vi.fn())
    })
    expect(hook().busy).toBe(true)
    await act(async () => {
      activation.resolve()
      await initial
    })
    const reopening = deferred<MonitoringOpenResult>()
    mocks.openDashboard.mockReturnValueOnce(reopening.promise)
    let next!: Promise<void>
    act(() => {
      next = hook().open(request, () => true, vi.fn())
    })
    expect(hook().busy).toBe(true)
    await act(async () => {
      reopening.resolve({ buffer, outcome: "reused" })
      await next
    })
    expect(hook().busy).toBe(false)
  })
})

describe("monitoring telemetry", () => {
  it("joins successful creation and opening by notebook ID", async () => {
    const hook = mount()
    await act(async () => {
      await hook().open(request, () => true, vi.fn())
    })
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.NOTEBOOK_CREATE, {
      source: "table_monitoring",
      notebookId: buffer.id,
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_OPEN,
      {
        notebookId: buffer.id,
        kind: "table",
        outcome: "created",
        history: true,
      },
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TAB_OPEN,
      expect.anything(),
    )
  })

  it("records a tab-limit failure even when creation returns without throwing", async () => {
    mocks.openDashboard.mockReset().mockResolvedValue(undefined)
    const hook = mount()
    await act(async () => {
      await hook().open(request, () => true, vi.fn())
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      expect.objectContaining({
        stage: "create_or_restore",
        reason: "tab_limit",
      }),
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_OPEN,
      expect.anything(),
    )
  })

  it("separates activation failure from successful creation", async () => {
    mocks.editor.setActiveBuffer.mockRejectedValue(
      new DOMException("sensitive detail", "QuotaExceededError"),
    )
    const hook = mount()
    await act(async () => {
      await hook().open(request, () => true, vi.fn())
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      {
        notebookId: buffer.id,
        kind: "table",
        stage: "activate",
        reason: "storage_quota",
      },
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_OPEN,
      expect.anything(),
    )
  })

  it("does not count a changed drawer target as an opened dashboard", async () => {
    const hook = mount()
    await act(async () => {
      await hook().open(request, () => false, vi.fn())
    })
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      expect.objectContaining({ reason: "target_changed" }),
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_OPEN,
      expect.anything(),
    )
    expect(mocks.editor.setActiveBuffer).not.toHaveBeenCalled()
  })
})
