import "../../test/stubBrowserGlobals"
import $ from "jquery"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
import { questClient } from "../../utils/questdb/queryClient"
import { questExecution } from "../../utils/questdb/queryExecution"
import { quickVis } from "./quick-vis"

const mocks = vi.hoisted(() => ({
  onDraw: undefined as (() => boolean) | undefined,
  setOption: vi.fn(),
  render: vi.fn(),
  selections: {
    "#_qvis_frm_chart_type": "bar",
    "#_qvis_frm_axis_x": "x",
    "#_qvis_frm_axis_y": ["y"],
  } as Record<string, string | string[]>,
}))
vi.mock("jquery", () => ({
  default: () => ({
    0: {},
    find: () => [{}],
    resize: vi.fn(),
    removeClass: vi.fn().mockReturnThis(),
    addClass: vi.fn().mockReturnThis(),
    click: (callback: () => boolean) => {
      mocks.onDraw = callback
    },
  }),
}))
vi.mock("slim-select", () => ({
  default: vi.fn(({ select }: { select: string }) => ({
    slim: { content: { classList: { add: vi.fn() } } },
    selected: () => mocks.selections[select],
    setData: vi.fn(),
    set: vi.fn(),
  })),
}))
vi.mock("react-dom", () => ({ default: { render: mocks.render } }))
vi.mock("echarts/lib/chart/bar", () => ({}))
vi.mock("echarts/lib/chart/line", () => ({}))
vi.mock("echarts/lib/component/tooltip", () => ({}))
vi.mock("echarts/lib/component/title", () => ({}))
vi.mock("echarts/components", () => ({
  LegendComponent: {},
  GridComponent: {},
}))
vi.mock("echarts/lib/echarts", () => ({
  use: vi.fn(),
  init: () => ({
    setOption: mocks.setOption,
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}))
vi.mock("./utils/macarons", () => ({ createMacaronsTheme: () => ({}) }))
vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../scenes/Editor/Monaco/utils", () => ({
  createDetachedQueryKey: (query: string) => `${query}@-1--1`,
}))

const result = {
  query: "select x, y from tab",
  columns: [
    { name: "x", type: "INT" },
    { name: "y", type: "INT" },
  ],
  dataset: [[1, 2]],
  count: 1,
}
let dispose: (() => void) | undefined
let publish: MockInstance<Parameters<typeof eventBus.publish>, void>
let subscribe: MockInstance<Parameters<typeof eventBus.subscribe>, void>

beforeEach(() => {
  authSessionState.markNonSSOAuthenticated()
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  )
  subscribe = vi.spyOn(eventBus, "subscribe")
  publish = vi.spyOn(eventBus, "publish")
  quickVisMount()
})

const quickVisMount = () => {
  dispose = quickVis($("#quick-vis"), $(window), questClient, questExecution)
  eventBus.publish(EventType.MSG_QUERY_DATASET, result)
  mocks.setOption.mockClear()
  publish.mockClear()
}

// Let the discarded async Draw callback settle, including promise-error events.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
const expectNoQueryOutcome = () => {
  expect(publish).not.toHaveBeenCalledWith(
    EventType.MSG_QUERY_OK,
    expect.anything(),
  )
  expect(publish).not.toHaveBeenCalledWith(
    EventType.MSG_QUERY_ERROR,
    expect.anything(),
  )
}

afterEach(() => {
  dispose?.()
  for (const [type, handler] of subscribe.mock.calls) {
    eventBus.unsubscribe(type, handler)
  }
  authSessionState.endSession()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("legacy Quick Vis promise settlement", () => {
  it("draws a successful query and releases its execution", async () => {
    mocks.onDraw!()
    await settle()
    expect(mocks.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        series: [expect.objectContaining({ data: [2] })],
      }),
      true,
    )
    expect(publish).toHaveBeenCalledWith(
      EventType.MSG_QUERY_OK,
      expect.objectContaining({ count: 1 }),
    )
    expect(questExecution.isAnyRunning()).toBe(false)
  })

  it("catches a session-ended rejection without publishing a stale chart outcome", async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        }),
    )
    mocks.onDraw!()
    expect(questExecution.isAnyRunning()).toBe(true)
    authSessionState.endSession()
    await settle()
    expectNoQueryOutcome()
    expect(mocks.setOption).not.toHaveBeenCalled()
    expect(questExecution.isAnyRunning()).toBe(false)

    // Settlement must also release the local request flag, not just the manager.
    authSessionState.markNonSSOAuthenticated()
    const cancel = vi.spyOn(questExecution, "cancelActive")
    mocks.onDraw!()
    expect(cancel).not.toHaveBeenCalled()
    await settle()
    expect(publish).toHaveBeenCalledWith(
      EventType.MSG_QUERY_OK,
      expect.anything(),
    )
  })

  it("does not clear a newer Draw when the cancelled request settles", async () => {
    const requests: Array<{
      signal: AbortSignal
      finish: (response: Response) => void
    }> = []
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const signal = init!.signal!
          requests.push({ signal, finish: resolve })
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        }),
    )
    mocks.onDraw!()
    mocks.onDraw!()
    await settle()
    expect(requests[0].signal.aborted).toBe(true)
    expect(requests[1].signal.aborted).toBe(false)
    expect(questExecution.isAnyRunning()).toBe(true)
    mocks.onDraw!()
    expect(requests[1].signal.aborted).toBe(true)
    requests[2].finish(new Response(JSON.stringify(result)))
    await settle()
    expect(publish).not.toHaveBeenCalledWith(
      EventType.MSG_QUERY_ERROR,
      expect.anything(),
    )
    expect(questExecution.isAnyRunning()).toBe(false)
  })

  it("reports an ordinary query rejection instead of leaking it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid column", position: 7 }), {
        status: 400,
      }),
    )
    mocks.onDraw!()
    await settle()
    const errors = publish.mock.calls.filter(
      ([type]) => type === EventType.MSG_QUERY_ERROR,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0][1]).toMatchObject({ r: { error: "Invalid column" } })
    expect(questExecution.isAnyRunning()).toBe(false)
  })

  it("releases cached redraws without treating the next Draw as cancellation", async () => {
    mocks.onDraw!()
    await settle()
    const cancel = vi.spyOn(questExecution, "cancelActive")
    mocks.onDraw!()
    await settle()
    mocks.onDraw!()
    await settle()
    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
    expect(questExecution.isAnyRunning()).toBe(false)
  })
})
