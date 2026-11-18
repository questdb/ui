// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { act } from "@testing-library/react"
import type { useMonitoringDashboard } from "../../../hooks/useMonitoringDashboard"
import { actions, selectors } from "../../../store"
import { StoreKey } from "../../../utils/localStorage/types"
import { LeftPanelType } from "../../../providers/LocalStorageProvider/types"
import {
  catalog,
  click,
  hook,
  mountDrawer,
  queryHook,
} from "./test/drawerHarness"

const opener = vi.hoisted(() => ({
  open: vi.fn<
    Parameters<ReturnType<typeof useMonitoringDashboard>["open"]>,
    Promise<void>
  >(),
  busy: false,
  unavailable: false,
}))
vi.mock("../../../hooks/useMonitoringDashboard", () => ({
  useMonitoringDashboard: () => opener,
}))

describe("drawer monitoring dashboard action", () => {
  it.each(["table", "matview"] as const)(
    "opens the selected %s, closes the left panel and keeps the drawer open",
    async (kind) => {
      const server = catalog()
      if (kind === "matview") {
        Object.assign(server.matViews[0], {
          refresh_type: "timer",
          timer_interval: 1,
          timer_interval_unit: "HOUR",
        })
      }
      opener.open.mockClear()
      localStorage.setItem(
        StoreKey.LEFT_PANEL_STATE,
        JSON.stringify({ type: LeftPanelType.DATASOURCES, width: 420 }),
      )
      const name = kind === "table" ? "trades" : "trades_mv"
      const store = await mountDrawer(name, kind)
      expect(hook("monitoring-dashboard")).toBeVisible()
      expect(hook("monitoring-dashboard")).toHaveTextContent(
        "Create monitoring dashboard",
      )
      await click("monitoring-dashboard")
      const [request, isCurrent, onOpened] = opener.open.mock.calls[0]
      expect(request.target).toMatchObject({ kind, name })
      if (kind === "matview")
        expect(request.refreshSchedule).toMatchObject({
          refresh_type: "timer",
          timer_interval: 1,
          timer_interval_unit: "HOUR",
        })
      expect(isCurrent()).toBe(true)
      act(() => {
        onOpened()
      })
      expect(selectors.console.getActiveSidebar(store.getState())?.type).toBe(
        "tableDetails",
      )
      expect(
        JSON.parse(localStorage.getItem(StoreKey.LEFT_PANEL_STATE)!),
      ).toEqual({ type: null, width: 420 })
    },
  )

  it.each([LeftPanelType.SEARCH, null])(
    "handles left panel state %s without opening or closing the drawer",
    async (type) => {
      catalog()
      opener.open.mockClear()
      localStorage.setItem(
        StoreKey.LEFT_PANEL_STATE,
        JSON.stringify({ type, width: 380 }),
      )
      const store = await mountDrawer()
      await click("monitoring-dashboard")
      act(() => opener.open.mock.calls[0][2]())
      expect(
        JSON.parse(localStorage.getItem(StoreKey.LEFT_PANEL_STATE)!),
      ).toEqual({ type: null, width: 380 })
      expect(selectors.console.getActiveSidebar(store.getState())?.type).toBe(
        "tableDetails",
      )
    },
  )

  it("does not advertise a dashboard for a non-WAL table", async () => {
    // Its history would come from WAL telemetry, which it has none of.
    const server = catalog()
    server.tables[0].walEnabled = false
    await mountDrawer("trades", "table")
    expect(queryHook("monitoring-dashboard")).not.toBeInTheDocument()
  })

  it.each(["view", "liveview"] as const)(
    "does not advertise an unsupported %s dashboard",
    async (kind) => {
      catalog()
      await mountDrawer(kind === "view" ? "trades_view" : "trades_lv", kind)
      expect(queryHook("monitoring-dashboard")).not.toBeInTheDocument()
    },
  )

  it.each([
    [{ busy: true, unavailable: false }, "true"],
    [{ busy: false, unavailable: true }, "false"],
  ])(
    "disables the action for %o and reports aria-busy=%s",
    async (state, ariaBusy) => {
      catalog()
      Object.assign(opener, state)
      try {
        await mountDrawer()
        expect(hook("monitoring-dashboard")).toBeDisabled()
        expect(hook("monitoring-dashboard")).toHaveAttribute(
          "aria-busy",
          ariaBusy,
        )
        // Only an opening dashboard shows progress.
        expect(queryHook("monitoring-dashboard-progress") !== null).toBe(
          state.busy,
        )
      } finally {
        Object.assign(opener, { busy: false, unavailable: false })
      }
    },
  )

  it("does not close a different target opened while a dashboard was being prepared", async () => {
    catalog()
    opener.open.mockClear()
    const store = await mountDrawer()
    await click("monitoring-dashboard")
    const [, isCurrent] = opener.open.mock.calls[0]
    act(() => {
      store.dispatch(
        actions.console.pushSidebarHistory({
          type: "tableDetails",
          payload: { tableName: "other", kind: "table" },
        }),
      )
    })
    expect(isCurrent()).toBe(false)
  })
})
