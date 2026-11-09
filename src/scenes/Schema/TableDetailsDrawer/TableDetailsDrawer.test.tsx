// @vitest-environment jsdom
import { act, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { actions } from "../../../store"
import {
  advance,
  catalog,
  click,
  deferred,
  flush,
  hook,
  liveView,
  loadSelectorTables,
  mountDrawer,
  queryHook,
  raw,
  selectTable,
  table,
  unavailable,
} from "./test/drawerHarness"

const open = async (
  store: Awaited<ReturnType<typeof mountDrawer>>,
  tableName = "trades",
  kind: "table" | "liveview" = "table",
) => {
  await act(async () => {
    store.dispatch(
      actions.console.pushSidebarHistory({
        type: "tableDetails",
        payload: { tableName, kind },
      }),
    )
    await Promise.resolve()
  })
}
const close = async (store: Awaited<ReturnType<typeof mountDrawer>>) => {
  await act(async () => {
    store.dispatch(actions.console.closeSidebar())
    await Promise.resolve()
  })
}

describe("drawer catalog availability", () => {
  it("revalidates a reopened target before showing its old row count", async () => {
    // Given
    const server = catalog()
    const store = await mountDrawer()
    expect(hook("row-count-value")).toHaveTextContent("12")
    await close(store)
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("tables()") ? response.promise : undefined
    // When
    await open(store)
    // Then
    expect(hook("loading")).toBeVisible()
    expect(queryHook("row-count-value")).not.toBeInTheDocument()
    // When
    await response.respond(
      Response.json(raw([{ ...table(), table_row_count: BigInt(24) }])),
    )
    // Then
    expect(hook("row-count-value")).toHaveTextContent("24")
  })

  it("uses cached metadata only after reopened requests become unavailable", async () => {
    // Given
    const server = catalog()
    const store = await mountDrawer()
    await close(store)
    server.reply = (query) =>
      query.startsWith("tables()") ? unavailable() : undefined
    // When
    await open(store)
    // Then
    expect(hook("loading")).toBeVisible()
    expect(queryHook("row-count-value")).not.toBeInTheDocument()
    // When
    await advance(2000)
    // Then
    expect(hook("tables-error")).toHaveTextContent("last successful response")
    expect(hook("row-count-value")).toHaveTextContent("12")
  })

  it("shows DDL loading until its request completes", async () => {
    // Given
    const server = catalog()
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("SHOW CREATE") ? response.promise : undefined
    await mountDrawer("trades", "table", "enabled")
    // When
    await click("tab-details")
    // Then
    expect(hook("ddl-loading")).toHaveTextContent("Loading")
    expect(hook("copy-ddl")).toBeDisabled()
    // When
    await response.respond(
      Response.json(raw([{ ddl: "CREATE TABLE trades (x LONG);" }])),
    )
    // Then
    expect(queryHook("ddl-loading")).not.toBeInTheDocument()
    expect(hook("copy-ddl")).toBeEnabled()
  })

  it("disables copy and explain after repeated DDL failures", async () => {
    // Given
    const server = catalog()
    await mountDrawer("trades", "table", "enabled")
    await click("tab-details")
    expect(hook("copy-ddl")).toBeEnabled()
    expect(hook("explain-ai")).toBeEnabled()
    // When
    server.reply = (query) =>
      query.startsWith("SHOW CREATE") ? unavailable() : undefined
    await advance(3000)
    // Then
    expect(hook("ddl-unavailable")).toHaveTextContent("Unavailable")
    expect(hook("copy-ddl")).toBeDisabled()
    expect(hook("explain-ai")).toBeDisabled()
  })

  it("reports unavailable columns without presenting an empty schema", async () => {
    // Given
    const server = catalog()
    server.reply = (query) =>
      query.startsWith("SHOW COLUMNS") ? unavailable() : undefined
    await mountDrawer()
    // When
    await click("tab-details")
    await advance(3000)
    // Then
    expect(hook("columns-unavailable")).toHaveTextContent("Unavailable")
    expect(hook("columns-unavailable")).not.toHaveTextContent("Columns (0)")
    expect(queryHook("columns-toggle")).not.toBeInTheDocument()
  })

  it("retains good table data through transient failures and marks an admitted outage", async () => {
    // Given
    const server = catalog()
    await mountDrawer()
    server.reply = (query) =>
      query.startsWith("tables()") ? unavailable() : undefined
    // When
    await advance(400)
    // Then
    expect(queryHook("tables-error")).not.toBeInTheDocument()
    expect(hook("row-count-value")).toHaveTextContent("12")
    // When
    await advance(2000)
    // Then
    expect(hook("tables-error")).toHaveTextContent("last successful response")
    expect(hook("row-count-value")).toHaveTextContent("12")
    expect(hook("health-status")).toHaveAttribute("data-severity", "unknown")
  })

  it("shows a full error when initial table metadata never succeeds", async () => {
    // Given
    const server = catalog()
    server.reply = (query) =>
      query.startsWith("tables()") ? unavailable() : undefined
    // When
    await mountDrawer()
    await advance(400)
    // Then
    expect(queryHook("source-error")).not.toBeInTheDocument()
    // When
    await advance(1600)
    // Then
    expect(hook("source-error")).toHaveAttribute("role", "alert")
    expect(hook("source-error")).toHaveTextContent("Unable to load trades")
    expect(hook("source-error")).toHaveTextContent("retry automatically")
    expect(queryHook("row-count-value")).not.toBeInTheDocument()
  })

  it("clears a removed target after one successful empty response", async () => {
    // Given
    const server = catalog()
    await mountDrawer()
    expect(hook("row-count-value")).toBeVisible()
    // When
    server.reply = (query) =>
      query.startsWith("tables()") ? Response.json(raw([])) : undefined
    await advance(200)
    // Then
    expect(hook("name")).toHaveValue("")
    expect(hook("empty-state")).toBeVisible()
  })

  it("retains table-backed details and warnings when matview metadata is missing", async () => {
    // Given
    const server = catalog()
    server.tables.find(
      (row) => row.table_name === "trades_mv",
    )!.table_memory_pressure_level = 1
    server.matViews = []
    // When
    await mountDrawer("trades_mv", "matview")
    await advance(2000)
    // Then
    expect(hook("kind-metadata-error")).toHaveTextContent("retry automatically")
    expect(hook("view-status")).toHaveTextContent("Unavailable")
    expect(hook("health-status")).toHaveAttribute("data-severity", "warning")
    expect(hook("tab-warning-badge")).toBeVisible()
    expect(queryHook("tab-error-badge")).not.toBeInTheDocument()
    // When
    await click("tab-details")
    // Then
    expect(hook("base-table-section")).toHaveTextContent("Unavailable")
    expect(hook("base-table-link")).toBeDisabled()
    for (const label of [
      "Deduplication",
      "Partitioning",
      "Refresh Type",
      "Unavailable",
    ])
      expect(hook("details-section")).toHaveTextContent(label)
  })

  it("retains unavailable live-view sections when metadata returns no rows", async () => {
    // Given
    const server = catalog()
    server.liveViews = []
    // When
    await mountDrawer("trades_lv", "liveview")
    await advance(2000)
    // Then
    expect(hook("kind-metadata-error")).toHaveTextContent("retry automatically")
    expect(hook("name")).toHaveValue("trades_lv")
    expect(hook("row-count-value")).toBeVisible()
    expect(hook("health-status")).toHaveAttribute("data-severity", "unknown")
    expect(hook("view-status")).toHaveTextContent("Unavailable")
    expect(hook("live-view-freshness")).toHaveTextContent("Unavailable")
    expect(hook("live-view-memory")).toHaveTextContent("Unavailable")
    expect(hook("live-view-memory")).toHaveTextContent(
      "Dropped Below Start From",
    )
    await Promise.resolve()
  })

  it("requires three failed polls and two successes before recovering live-view status", async () => {
    // Given
    const server = catalog()
    server.reply = (query) =>
      query.startsWith("live_views()") ? unavailable() : undefined
    await mountDrawer("trades_lv", "liveview")
    // When
    await advance(1000)
    // Then
    expect(queryHook("kind-metadata-error")).not.toBeInTheDocument()
    // When
    await advance(1000)
    // Then
    expect(hook("kind-metadata-error")).toHaveTextContent("retry automatically")
    expect(hook("health-status")).toHaveAttribute("data-severity", "unknown")
    // When
    server.reply = () => undefined
    await advance(1000)
    // Then
    expect(hook("kind-metadata-error")).toBeVisible()
    // When
    await advance(1000)
    // Then
    expect(queryHook("kind-metadata-error")).not.toBeInTheDocument()
    expect(hook("view-status")).toHaveTextContent("Active")
    expect(hook("health-status")).toHaveAttribute("data-severity", "healthy")
  })

  it("lets a slow catalog response finish without restarting it each poll period", async () => {
    // Given
    const server = catalog()
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("live_views()") ? response.promise : undefined
    await mountDrawer("trades_lv", "liveview")
    const requests = () =>
      server.requests.filter((request) =>
        request.query.startsWith("live_views()"),
      )
    // When
    await advance(1500)
    // Then
    expect(requests()).toHaveLength(1)
    expect(requests()[0].signal?.aborted).toBe(false)
    expect(hook("loading")).toBeVisible()
    // When
    await response.respond(Response.json(raw([liveView()])))
    // Then
    expect(hook("view-status")).toHaveTextContent("Active")
    expect(hook("live-view-memory")).toBeVisible()
  })

  it("ignores an old live-view response after the selected target changes", async () => {
    // Given
    const server = catalog()
    const store = await mountDrawer("trades_lv", "liveview")
    await loadSelectorTables(store)
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("live_views()") && query.includes("'trades_lv'")
        ? response.promise
        : undefined
    await advance(1000)
    const oldRequest = server.requests
      .filter(
        (request) =>
          request.query.startsWith("live_views()") &&
          request.query.includes("'trades_lv'"),
      )
      .at(-1)!
    Object.assign(server.liveViews[1], {
      view_status: "seeding",
      in_mem_rows: BigInt(222),
    })
    // When
    await selectTable("other_lv")
    expect(hook("type-badge")).toHaveTextContent("Live view")
    expect(hook("view-status")).toHaveTextContent("Seeding")
    expect(hook("live-view-memory")).toHaveTextContent("222")
    await response.respond(
      Response.json(
        raw([
          {
            ...liveView(),
            view_status: "invalid",
            invalidation_reason: "old target",
            in_mem_rows: BigInt(111),
          },
        ]),
      ),
    )
    // Then
    expect(oldRequest.signal?.aborted).toBe(true)
    expect(hook("name")).toHaveValue("other_lv")
    expect(hook("view-status")).toHaveTextContent("Seeding")
    expect(hook("live-view-memory")).toHaveTextContent("222")
    expect(hook("live-view-memory")).not.toHaveTextContent("111")
  })

  it("ignores an old base-table response after the selected live view changes", async () => {
    // Given
    const server = catalog()
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("tables()") && query.includes("'trades'")
        ? response.promise
        : undefined
    const store = await mountDrawer("trades_lv", "liveview")
    await loadSelectorTables(store)
    const oldRequest = server.requests.find(
      (request) =>
        request.query.startsWith("tables()") &&
        request.query.includes("'trades'"),
    )!
    // When
    await selectTable("other_lv")
    expect(hook("type-badge")).toHaveTextContent("Live view")
    expect(hook("base-table-status")).toHaveTextContent("Valid")
    await response.respond(Response.json(raw([])))
    await flush()
    // Then
    expect(oldRequest.signal?.aborted).toBe(true)
    expect(hook("name")).toHaveValue("other_lv")
    expect(hook("base-table-status")).toHaveTextContent("Valid")
    expect(hook("base-table-status")).not.toHaveTextContent("Dropped")
  })
  it("polls a plain view at the details cadence without showing monitoring tabs", async () => {
    // Given
    const server = catalog()
    await mountDrawer("trades_view", "view")
    const requests = () =>
      server.requests.filter(
        (request) =>
          request.query.startsWith("tables()") &&
          request.query.includes("'trades_view'"),
      )
    const initial = requests().length
    // When
    await advance(999)
    // Then
    expect(requests()).toHaveLength(initial)
    expect(queryHook("tab-monitoring")).not.toBeInTheDocument()
    expect(queryHook("tab-details")).not.toBeInTheDocument()
    // When
    await advance(1)
    // Then
    expect(requests()).toHaveLength(initial + 1)
    expect(hook("columns-content")).toBeVisible()
    // When
    await advance(1000)
    // Then
    expect(requests()).toHaveLength(initial + 2)
  })
})

describe("table details disabled AI controls", () => {
  for (const mode of ["disabled", "no-schema"] as const) {
    it(`explains blocked AI actions when ${mode === "no-schema" ? "schema access is denied" : "AI is unconfigured"}`, async () => {
      // Given
      const server = catalog()
      server.tables[0].table_suspended = true
      server.tables[0].table_write_amp_p50 = 10
      await mountDrawer("trades", "table", mode)
      const reason =
        mode === "no-schema"
          ? "Schema access is not granted to this model"
          : "AI Assistant is not configured"
      // When / Then
      for (const name of ["error-ask-ai", "warning-ask-ai", "explain-ai"]) {
        if (name === "explain-ai") {
          await click("tab-details")
          expect(hook("copy-ddl")).toBeEnabled()
        }
        expect(hook(name)).toBeDisabled()
        fireEvent.pointerMove(hook(name), { pointerType: "mouse" })
        await advance(1000)
        expect(
          document.querySelector('[data-hook="tooltip"]'),
        ).toHaveTextContent(reason)
        fireEvent.click(hook(name))
        expect(
          document.querySelector('[data-hook="ai-chat-window"]'),
        ).not.toBeInTheDocument()
        fireEvent.pointerLeave(hook(name), { pointerType: "mouse" })
        await advance(1000)
      }
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0)
    })
  }
})

describe("table health presentation", () => {
  it("shows WAL suspension, its documentation, and the recovery action", async () => {
    // Given
    const server = catalog()
    server.tables[0].table_suspended = true
    // When
    await mountDrawer()
    // Then
    expect(hook("health-status")).toHaveAttribute("data-severity", "critical")
    expect(hook("tab-error-badge")).toBeVisible()
    expect(hook("resume-wal-button")).toBeVisible()
    expect(hook("error-ask-ai")).toBeDisabled()
    expect(hook("error-docs-link")).toHaveAttribute(
      "href",
      expect.stringContaining("questdb.com/docs"),
    )
  })

  it.each([
    ["table_memory_pressure_level", 2, "critical", "Memory backoff"],
    ["wal_tx_size_p90", BigInt(50), "warning", "Small transactions"],
    ["table_write_amp_p50", 3.5, "warning", "High write amplification"],
    ["table_memory_pressure_level", 1, "warning", "High memory pressure"],
  ])(
    "maps %s=%s to the matching health badge and guidance",
    async (field, value, severity, message) => {
      // Given
      const server = catalog()
      server.tables[0][String(field)] = value
      // When
      await mountDrawer()
      // Then
      expect(hook("health-status")).toHaveAttribute("data-severity", severity)
      expect(
        hook(severity === "critical" ? "error-banner" : "performance-alerts"),
      ).toHaveTextContent(String(message))
      expect(
        hook(severity === "critical" ? "tab-error-badge" : "tab-warning-badge"),
      ).toBeVisible()
    },
  )

  it("hides WAL ingestion controls for a non-WAL table", async () => {
    // Given
    const server = catalog()
    server.tables[0].walEnabled = false
    // When
    await mountDrawer()
    // Then
    expect(hook("wal-disabled")).toBeVisible()
    expect(queryHook("ingestion-content")).not.toBeInTheDocument()
    expect(queryHook("ingestion-toggle")).not.toBeInTheDocument()
  })

  it("shows the invalid materialized view and its catalog reason", async () => {
    // Given
    const server = catalog()
    Object.assign(server.matViews[0], {
      view_status: "invalid",
      invalidation_reason: "base table was dropped",
    })
    // When
    await mountDrawer("trades_mv", "matview")
    // Then
    expect(hook("health-status")).toHaveAttribute("data-severity", "critical")
    expect(hook("error-banner")).toHaveTextContent("base table was dropped")
    expect(hook("view-status")).toHaveTextContent("Invalid")
    expect(queryHook("resume-wal-button")).not.toBeInTheDocument()
  })

  it("shows permanent invalidation guidance without offering WAL recovery for a live view", async () => {
    // Given
    const server = catalog()
    Object.assign(server.liveViews[0], {
      view_status: "invalid",
      invalidation_reason: "rename column operation [column=price]",
    })
    // When
    await mountDrawer("trades_lv", "liveview")
    // Then
    expect(hook("health-status")).toHaveAttribute("data-severity", "critical")
    expect(hook("error-banner")).toHaveTextContent("Live view is invalid")
    expect(hook("error-banner")).toHaveTextContent("Invalidation is permanent")
    expect(hook("view-status")).toHaveTextContent("Invalid")
    expect(queryHook("resume-wal-button")).not.toBeInTheDocument()
  })

  it.each([
    ["state_unreadable", "State unreadable"],
    ["version_unsupported", "Version unsupported"],
  ])(
    "keeps unavailable metric and definition cards for %s",
    async (status, label) => {
      // Given
      const server = catalog()
      for (const key of Object.keys(server.liveViews[0])) {
        if (!["view_name", "view_status", "view_table_dir_name"].includes(key))
          server.liveViews[0][key] = null
      }
      server.liveViews[0].view_status = status
      // When
      await mountDrawer("trades_lv", "liveview")
      // Then
      expect(hook("health-status")).toHaveAttribute("data-severity", "critical")
      expect(hook("view-status")).toHaveTextContent(label)
      expect(hook("base-table-status")).toHaveTextContent("Unknown")
      for (const section of ["live-view-freshness", "live-view-memory"]) {
        expect(hook(section)).toBeVisible()
        expect(hook(section)).toHaveTextContent("Unavailable")
        expect(hook(section)).not.toHaveTextContent(/Never|Unknown/)
      }
      if (status === "state_unreadable") {
        expect(hook("error-banner")).toHaveTextContent(
          "Live view state files are unreadable",
        )
        expect(hook("error-banner")).toHaveTextContent(
          "drop and recreate the view",
        )
      }
      // When
      await click("tab-details")
      // Then
      expect(hook("details-section")).toHaveTextContent("Partitioning")
      for (const card of [
        "flush-every-card",
        "in-memory-card",
        "start-from-card",
      ])
        expect(hook(card)).toHaveTextContent("Unavailable")
      expect(hook("start-from-card")).not.toHaveTextContent("Beginning")
    },
  )

  it("warns when successive catalog samples show pending rows accumulating", async () => {
    // Given
    const server = catalog()
    server.tables[0].wal_pending_row_count = BigInt(1000)
    await mountDrawer()
    // When
    for (let sample = 1; sample <= 24; sample++) {
      if (sample === 20) {
        expect(queryHook("performance-alerts")).not.toBeInTheDocument()
        expect(hook("health-status")).toHaveAttribute(
          "data-severity",
          "healthy",
        )
      }
      server.tables[0].wal_pending_row_count = BigInt(1000 + sample * 500)
      await advance(250)
    }
    // Then
    expect(hook("pending-rows-trend")).toHaveAttribute(
      "data-trend",
      "increasing",
    )
    expect(hook("health-status")).toHaveAttribute("data-severity", "warning")
    expect(hook("tab-warning-badge")).toBeVisible()
    expect(hook("performance-alerts")).toHaveTextContent("Pending rows")
  })

  it("shows recovery without warning when the writer catches up with WAL transactions", async () => {
    // Given
    const server = catalog()
    server.tables[0].table_txn = BigInt(70)
    await mountDrawer()
    // When
    for (let sample = 1; sample <= 12; sample++) {
      server.tables[0].table_txn = BigInt(70 + sample * 2)
      await advance(250)
    }
    // Then
    expect(hook("transaction-lag-trend")).toHaveAttribute(
      "data-trend",
      "decreasing",
    )
    expect(hook("health-status")).toHaveAttribute("data-severity", "healthy")
    expect(queryHook("performance-alerts")).not.toBeInTheDocument()
  })
})

describe("live view catalog metrics", () => {
  it("preserves LONG precision through the HTTP client and visible counters", async () => {
    // Given
    const server = catalog()
    Object.assign(server.liveViews[0], {
      lag_seqtxn: BigInt("9007199254740993"),
      in_mem_rows: BigInt("9007199254740993"),
    })
    // When
    await mountDrawer("trades_lv", "liveview")
    // Then
    expect(hook("live-view-freshness")).toHaveTextContent(
      "9,007,199,254,740,993 txns",
    )
    expect(hook("live-view-memory")).toHaveTextContent("9,007,199,254,740,993")
  })

  it("shows seeding, writer stall, and both discarded-row counters", async () => {
    // Given
    const server = catalog()
    Object.assign(server.liveViews[0], {
      view_status: "seeding",
      writer_stall_micros: BigInt(6500000),
      below_lower_bound_count: BigInt(5),
      o3_rejected_count: BigInt(3),
    })
    // When
    await mountDrawer("trades_lv", "liveview")
    // Then
    expect(hook("view-status")).toHaveTextContent("Seeding")
    expect(hook("live-view-freshness")).toHaveTextContent("Writer Stall")
    expect(hook("live-view-freshness")).toHaveTextContent("6.5 s")
    expect(hook("live-view-memory")).toHaveTextContent(
      "Dropped Below Start From",
    )
    expect(hook("live-view-memory")).toHaveTextContent(
      "5 in-order · 3 out-of-order",
    )
  })

  it("distinguishes an unresolved transaction lag from a view that has never flushed", async () => {
    // Given
    const server = catalog()
    Object.assign(server.liveViews[0], { lag_micros: null, lag_seqtxn: null })
    // When
    await mountDrawer("trades_lv", "liveview")
    // Then
    expect(hook("live-view-freshness")).toHaveTextContent("Unknown")
    expect(hook("live-view-freshness")).toHaveTextContent("Never")
  })
})

describe("enterprise table storage policy", () => {
  it("distinguishes loading, no policy, and an unavailable policy", async () => {
    // Given
    const server = catalog()
    server.enterprise = true
    const response = deferred()
    server.reply = (query) =>
      query.startsWith("storage_policies") ? response.promise : undefined
    await mountDrawer()
    // When
    await click("tab-details")
    // Then
    expect(hook("storage-loading")).toBeVisible()
    // When
    await response.respond(Response.json(raw([])))
    // Then
    expect(hook("storage-policy-section")).toHaveTextContent("Not configured")
    for (const label of [
      "To Parquet",
      "To Remote",
      "Drop Local",
      "Drop Remote",
    ])
      expect(hook("storage-policy-section")).not.toHaveTextContent(label)
    expect(hook("details-section")).not.toHaveTextContent("TTL")
    // When
    server.reply = (query) =>
      query.startsWith("storage_policies") ? unavailable() : undefined
    await advance(15000)
    // Then
    expect(hook("storage-unavailable")).toHaveTextContent("Unavailable")
  })

  it("shows storage for an enterprise table but never requests it for a live view", async () => {
    // Given
    const server = catalog()
    server.enterprise = true
    const store = await mountDrawer()
    await loadSelectorTables(store)
    await click("tab-details")
    expect(hook("storage-policy-section")).toBeVisible()
    const count = server.requests.filter((request) =>
      request.query.startsWith("storage_policies"),
    ).length
    // When
    await selectTable("trades_lv")
    expect(hook("name")).toHaveValue("trades_lv")
    expect(hook("type-badge")).toHaveTextContent("Live view")
    await click("tab-details")
    await advance(5000)
    // Then
    expect(hook("flush-every-card")).toBeVisible()
    expect(queryHook("storage-policy-section")).not.toBeInTheDocument()
    expect(
      server.requests.filter((request) =>
        request.query.startsWith("storage_policies"),
      ),
    ).toHaveLength(count)
  })
})
