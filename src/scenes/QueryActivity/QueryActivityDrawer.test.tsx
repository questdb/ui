// @vitest-environment jsdom
import {
  activityServer,
  advance,
  click,
  flush,
  get,
  getRow,
  openDrawer,
  query,
  renderActivity,
  rowIds,
} from "./test/drawerHarness"
import {
  CANCELLED_ROW,
  CRITICAL_ROW,
  listingResponse,
  SELF_ROW,
  WAL_ROW,
  WARNING_ROW,
} from "./test/fixtures"
import { act, fireEvent, within } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

const pickOrder = async (key: string) => {
  await act(async () => {
    fireEvent.keyDown(get("sort-trigger"), { key: "Enter", code: "Enter" })
    await Promise.resolve()
  })
  await click(get(`sort-${key}`))
}
const filter = async (value: string) => {
  await act(async () => {
    fireEvent.change(get("search"), { target: { value } })
    await Promise.resolve()
  })
}

describe("Query Activity drawer", () => {
  it("lists running queries without its own listing query", async () => {
    // Given
    activityServer([SELF_ROW, CRITICAL_ROW, WARNING_ROW, WAL_ROW])
    await renderActivity()
    // When
    await openDrawer()
    // Then
    expect(get("count-badge")).toHaveTextContent("3 running")
    expect(get("summary-active")).toHaveTextContent("3")
    expect(get("summary-memory")).toHaveTextContent("908.0 MiB")
    expect(rowIds()).toHaveLength(3)
    expect(get("list")).not.toHaveTextContent("query_activity()")
    expect(get("row-query")).toHaveTextContent("approx_percentile")
  })

  it("sorts by memory by default, grades memory-heavy queries and re-sorts from the menu", async () => {
    // Given
    activityServer([SELF_ROW, WAL_ROW, WARNING_ROW, CRITICAL_ROW])
    await renderActivity()
    // When
    await openDrawer()
    // Then
    expect(rowIds()).toEqual(["62179", "57777", "58001"])
    expect(getRow(62179)).toHaveAttribute("data-severity", "warning")
    expect(getRow(62179)).toHaveTextContent("Started 1m 12s ago")
    expect(getRow(62179)).toHaveTextContent("812.0 MiB / 1.0 GiB")
    expect(getRow(57777)).toHaveAttribute("data-severity", "none")
    expect(getRow(58001)).toHaveAttribute("data-severity", "none")
    expect(within(getRow(58001)).getByText("WAL")).toBeInTheDocument()
    expect(
      within(getRow(58001)).queryByRole("button", { name: "Cancel query" }),
    ).not.toBeInTheDocument()
    // When / Then
    await pickOrder("memory-desc")
    expect(get("sort-trigger")).toHaveTextContent("Most memory")
    expect(rowIds()).toEqual(["62179", "57777", "58001"])
    await pickOrder("memory-asc")
    expect(rowIds()).toEqual(["57777", "62179", "58001"])
    await pickOrder("started-desc")
    expect(rowIds()).toEqual(["58001", "57777", "62179"])
  })

  it("mutes a cancelled query and never grades it", async () => {
    // Given
    const active = [...CANCELLED_ROW]
    active[0] = 58011
    active[6] = "active"
    activityServer([SELF_ROW, CANCELLED_ROW, active])
    await renderActivity()
    // When
    await openDrawer()
    // Then
    expect(getRow(58011)).toHaveAttribute("data-severity", "critical")
    expect(getRow(58010)).toHaveAttribute("data-state", "cancelled")
    expect(getRow(58010)).toHaveAttribute("data-severity", "none")
    expect(getRow(58010)).toHaveTextContent("Cancelled")
    expect(
      within(getRow(58010)).queryByRole("button", { name: "Cancel query" }),
    ).not.toBeInTheDocument()
  })

  it("cancels a query only after confirmation and drops the in-flight listing", async () => {
    // Given
    const server = activityServer([SELF_ROW, CRITICAL_ROW])
    await renderActivity()
    await openDrawer()
    // When
    await click(get("row-cancel"))
    await click(get("cancel-dismiss"))
    // Then
    expect(query("cancel-dialog")).not.toBeInTheDocument()
    expect(server.cancellations).toEqual([])
    // Given
    let release!: (response: Response) => void
    server.respond = () =>
      new Promise<Response>((resolve) => {
        release = resolve
      })
    await advance(1000)
    const oldSignal = server.listings[1].signal!
    expect(oldSignal.aborted).toBe(false)
    const oldResponse = Response.json(listingResponse([SELF_ROW, CRITICAL_ROW]))
    const readOldBody = vi.spyOn(oldResponse, "text")
    server.respond = () => Response.json(listingResponse([SELF_ROW]))
    // When
    await click(get("row-cancel"))
    await click(get("cancel-confirm"))
    // Then
    expect(server.cancellations).toEqual(["CANCEL QUERY 62179;"])
    expect(query("cancel-dialog")).not.toBeInTheDocument()
    expect(oldSignal.aborted).toBe(true)
    expect(server.listings).toHaveLength(3)
    expect(getRow(62179)).toHaveAttribute("data-state", "finished")
    // When the transport still delivers its obsolete body
    await act(async () => {
      release(oldResponse)
      await Promise.resolve()
    })
    // Then
    expect(readOldBody).toHaveBeenCalledOnce()
    expect(server.listings).toHaveLength(3)
    expect(getRow(62179)).toHaveAttribute("data-state", "finished")
  })

  it("filters rows by query text, user, or id", async () => {
    // Given
    activityServer([SELF_ROW, CRITICAL_ROW, WARNING_ROW, WAL_ROW])
    await renderActivity()
    await openDrawer()
    // When / Then
    for (const [text, id] of [
      ["staging", "57777"],
      ["SYSTEM", "58001"],
      ["621", "62179"],
    ]) {
      await filter(text)
      expect(rowIds()).toEqual([id])
    }
    await filter("nothing here")
    expect(get("no-match")).toBeInTheDocument()
    await click(get("search-clear"))
    expect(rowIds()).toHaveLength(3)
    await filter("staging")
    fireEvent.keyDown(get("search"), { key: "Escape", code: "Escape" })
    await flush()
    expect(get("search")).toHaveValue("")
    expect(rowIds()).toHaveLength(3)
    expect(get("drawer")).toBeInTheDocument()
  })

  it("keeps a vanished query as finished for a few seconds", async () => {
    // Given
    const server = activityServer([SELF_ROW, CRITICAL_ROW, WARNING_ROW])
    await renderActivity()
    await openDrawer()
    server.dataset = [SELF_ROW, CRITICAL_ROW]
    // When
    await advance(1000)
    // Then
    expect(getRow(57777)).toHaveAttribute("data-state", "finished")
    expect(getRow(57777)).toHaveTextContent("Finished")
    expect(
      within(getRow(57777)).queryByRole("button", { name: "Cancel query" }),
    ).not.toBeInTheDocument()
    // When / Then
    await advance(4000)
    expect(getRow(57777)).toHaveAttribute("data-state", "finished")
    await advance(1000)
    expect(rowIds()).toEqual(["62179"])
  })

  it("shows an empty state when only its own listing query runs", async () => {
    // Given
    activityServer([SELF_ROW])
    await renderActivity()
    // When
    await openDrawer()
    // Then
    expect(get("empty")).toBeInTheDocument()
    expect(rowIds()).toEqual([])
  })

  it("shows an error state when the listing keeps failing", async () => {
    // Given
    const server = activityServer()
    server.failure = true
    await renderActivity()
    // When
    await openDrawer()
    // Then
    expect(server.listings).toHaveLength(1)
    expect(query("error-banner")).not.toBeInTheDocument()
    // When / Then
    await advance(1000)
    expect(server.listings).toHaveLength(2)
    expect(query("error-banner")).not.toBeInTheDocument()
    await advance(2000)
    expect(server.listings).toHaveLength(3)
    expect(get("error-banner")).toBeInTheDocument()
  })

  it("shows an error with a retry action when auto refresh is off", async () => {
    // Given
    const server = activityServer()
    server.failure = true
    await renderActivity({ "auto.refresh.queryActivity": "false" })
    // When
    await openDrawer()
    // Then
    expect(get("error-banner")).toBeInTheDocument()
    expect(query("loading")).not.toBeInTheDocument()
    await advance(30000)
    expect(server.listings).toHaveLength(1)
    // When
    server.failure = false
    server.dataset = [SELF_ROW, CRITICAL_ROW]
    await click(get("retry-button"))
    // Then
    expect(query("error-banner")).not.toBeInTheDocument()
    expect(rowIds()).toEqual(["62179"])
    expect(server.listings).toHaveLength(2)
  })

  it("fetches immediately when auto refresh is turned on", async () => {
    // Given
    const server = activityServer([SELF_ROW, CRITICAL_ROW])
    await renderActivity({ "auto.refresh.queryActivity": "false" })
    await openDrawer()
    server.dataset = [SELF_ROW]
    // When
    await click(get("auto-refresh-button"))
    // Then
    expect(server.listings).toHaveLength(2)
    expect(getRow(62179)).toHaveAttribute("data-state", "finished")
    expect(localStorage.getItem("auto.refresh.queryActivity")).toBe("true")
    // When
    await advance(5000)
    // Then
    expect(get("empty")).toBeInTheDocument()
  })

  it("keeps the start time correct when the drawer reopens", async () => {
    // Given
    activityServer([SELF_ROW, CRITICAL_ROW])
    await renderActivity()
    await openDrawer()
    expect(get("row-started")).toHaveTextContent("Started 1m 12s ago")
    // When
    await click(get("toggle-button"))
    expect(query("drawer")).not.toBeInTheDocument()
    await advance(10000)
    await openDrawer()
    // Then
    expect(get("row-started")).toHaveTextContent("Started 1m 12s ago")
  })

  it("reports how stale the listing is while auto refresh is off", async () => {
    // Given
    const server = activityServer([SELF_ROW, CRITICAL_ROW])
    await renderActivity({ "auto.refresh.queryActivity": "false" })
    await openDrawer()
    expect(get("last-updated")).toHaveTextContent("Last updated <1s ago")
    // When
    await advance(30000)
    // Then
    expect(server.listings).toHaveLength(1)
    expect(get("last-updated")).toHaveTextContent("Last updated 30s ago")
  })
})
