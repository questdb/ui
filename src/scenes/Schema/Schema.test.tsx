// @vitest-environment jsdom
import {
  writeClipboard,
  all,
  expand,
  get,
  hover,
  mountSchema,
  names,
  query,
  schemaServer,
  tableTitle,
} from "./test/schemaHarness"
import { table } from "./TableDetailsDrawer/test/catalogFixtures"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"

const filter = () =>
  document.querySelector<HTMLInputElement>('input[name="table_filter"]')!
const key = async (value: string) => userEvent.keyboard(`{${value}}`)
const rowContaining = (text: string) =>
  screen.getByText(text).closest<HTMLElement>('[data-hook="schema-row"]')!

describe("schema filtering and selection", () => {
  it("filters the exact table name and restores all names when cleared", async () => {
    // Given
    const server = schemaServer()
    server.tables = server.tables.filter((row) => row.table_type === "T")
    await mountSchema()
    // When
    await userEvent.type(filter(), "btc_trades")
    // Then
    await waitFor(() => expect(all("schema-table-title")).toHaveLength(1))
    expect(get("schema-table-title")).toHaveTextContent("btc_trades")
    // When
    await userEvent.click(get("schema-search-clear-button"))
    // Then
    await waitFor(() => expect(all("schema-table-title")).toHaveLength(4))
    names.forEach((name) => expect(tableTitle(name)).toBeInTheDocument())
    expect(query("schema-search-clear-button")).not.toBeInTheDocument()
  })

  it("finds matching columns and clears automatic table expansion", async () => {
    // Given
    const server = schemaServer()
    server.tables = [table("contains_magicword"), table("contains_simpleword")]
    server.columns = [
      {
        table_name: "contains_magicword",
        ordinal_position: 1,
        column_name: "magicword",
        data_type: "STRING",
      },
      {
        table_name: "contains_magicword",
        ordinal_position: 2,
        column_name: "ts",
        data_type: "TIMESTAMP",
      },
      {
        table_name: "contains_simpleword",
        ordinal_position: 1,
        column_name: "simpleword",
        data_type: "STRING",
      },
    ]
    await mountSchema()
    // When / Then
    for (const word of ["magicword", "simpleword"]) {
      await userEvent.type(filter(), word)
      await waitFor(() =>
        expect(
          document.querySelectorAll('[data-search-match="true"]'),
        ).toHaveLength(2),
      )
      expect(get("schema-table-title")).toHaveTextContent(`contains_${word}`)
      expect(get("schema-column-title")).toHaveTextContent(word)
      await userEvent.click(get("schema-search-clear-button"))
      await waitFor(() => expect(all("schema-table-title")).toHaveLength(2))
      expect(
        document.querySelector('[data-expanded="true"][data-kind="table"]'),
      ).not.toBeInTheDocument()
    }
    await userEvent.type(filter(), "ts")
    await waitFor(() => expect(all("schema-table-title")).toHaveLength(1))
    expect(get("schema-table-title")).toHaveTextContent("contains_magicword")
    expect(
      document.querySelector('[data-kind="column"][data-search-match="true"]'),
    ).toHaveTextContent("ts")
  })

  it("selects, deselects, and toggles all table schemas before copying", async () => {
    // Given
    const server = schemaServer()
    server.tables = server.tables.filter((row) => row.table_type === "T")
    await mountSchema()
    await userEvent.click(get("schema-select-button"))
    expect(get("schema-copy-to-clipboard-button")).toBeDisabled()
    // When / Then
    await userEvent.click(tableTitle("btc_trades"))
    expect(get("schema-copy-to-clipboard-button")).toBeEnabled()
    await userEvent.click(tableTitle("btc_trades"))
    expect(get("schema-copy-to-clipboard-button")).toBeDisabled()
    await userEvent.click(get("schema-select-all-button"))
    await userEvent.click(get("schema-select-all-button"))
    expect(get("schema-copy-to-clipboard-button")).toBeDisabled()
    await userEvent.click(get("schema-select-all-button"))
    await userEvent.click(get("schema-copy-to-clipboard-button"))
    await waitFor(() =>
      expect(
        server.queries.filter((sql) => sql.startsWith("SHOW CREATE")),
      ).toHaveLength(4),
    )
    await waitFor(() =>
      expect(query("schema-copy-to-clipboard-button")).not.toBeInTheDocument(),
    )
    expect(get("schema-select-button")).toBeInTheDocument()
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce())
  })
})

describe("schema table icon", () => {
  it("describes a WAL day-partitioned table from its tree row metadata", async () => {
    // Given
    const server = schemaServer()
    server.tables = server.tables.map((row) =>
      row.table_name === "btc_trades"
        ? row
        : { ...row, walEnabled: false, partitionBy: "MONTH" },
    )
    await mountSchema()
    // When
    await hover(
      tableTitle("btc_trades")
        .closest<HTMLElement>('[data-hook="schema-row"]')!
        .querySelector<HTMLElement>('[data-hook="table-icon"]')!,
    )
    // Then
    expect(get("tooltip")).toHaveTextContent(
      'WAL-based table. Partitioned by "day", ordered on "timestamp" column.',
    )
    expect(get("tooltip")).toHaveTextContent(
      "WAL-based tables are the current and most up-to-date table format.",
    )
  })
})

describe("schema keyboard handlers", () => {
  it("walks table, column, symbol, and base-table hierarchies with arrow keys", async () => {
    // Given
    schemaServer()
    await mountSchema()
    await userEvent.dblClick(tableTitle("btc_trades"))
    // When / Then
    await key("ArrowDown")
    await key("ArrowRight")
    expect(get("schema-column-title")).toHaveTextContent("symbol")
    await key("ArrowRight")
    await key("ArrowRight")
    await screen.findByText("Indexed:")
    await key("ArrowLeft")
    expect(screen.queryByText("Indexed:")).not.toBeInTheDocument()
    await key("ArrowLeft")
    expect(document.activeElement).toHaveTextContent("Columns")
    await key("ArrowLeft")
    expect(query("schema-column-title")).not.toBeInTheDocument()
    await key("ArrowLeft")
    expect(document.activeElement).toHaveTextContent("btc_trades")
    await key("ArrowLeft")
    expect(screen.queryByText("Columns")).not.toBeInTheDocument()
    await key("ArrowLeft")
    expect(document.activeElement).toHaveTextContent("Tables (4)")
    await key("ArrowLeft")
    expect(query("schema-table-title")).not.toBeInTheDocument()
    await key("ArrowDown")
    await key("ArrowRight")
    expect(get("schema-matview-title")).toHaveTextContent("btc_trades_mv")
    await key("ArrowRight")
    await key("ArrowRight")
    await userEvent.dblClick(screen.getByText("Base tables"))
    expect(get("schema-detail-title")).toHaveTextContent("btc_trades")
    await key("ArrowLeft")
    expect(query("schema-detail-title")).not.toBeInTheDocument()
    await userEvent.dblClick(get("schema-matview-title"))
    expect(screen.queryByText("Base tables")).not.toBeInTheDocument()
    await key("ArrowUp")
    await key("ArrowLeft")
    expect(query("schema-matview-title")).not.toBeInTheDocument()
  })

  it("focuses the first and last roots with Home and End", async () => {
    // Given
    const server = schemaServer()
    server.tables = server.tables.filter((row) => row.table_type !== "L")
    await mountSchema()
    await expand("materialized-views")
    // When / Then
    await key("Home")
    expect(document.activeElement).toHaveTextContent("Tables (4)")
    await key("End")
    expect(document.activeElement).toHaveTextContent("Views (1)")
  })
})

describe("view catalog joins and warnings", () => {
  for (const [kind, status, reason, message] of [
    [
      "matview",
      "invalid",
      "this is an invalidation reason",
      "Materialized view is invalid: this is an invalidation reason",
    ],
    ["matview", "invalid", null, "Materialized view is invalid"],
    [
      "liveview",
      "invalid",
      "this is an invalidation reason",
      "Live view is invalid: this is an invalidation reason",
    ],
    [
      "liveview",
      "state_unreadable",
      null,
      "Live view state files are unreadable",
    ],
  ] as const) {
    it(`joins ${kind} ${status} metadata with ${reason === null ? "no reason" : "its reason"} to the matching row`, async () => {
      // Given
      const server = schemaServer()
      await mountSchema()
      await expand(kind === "matview" ? "materialized-views" : "live-views")
      expect(query("schema-row-error-icon")).not.toBeInTheDocument()
      // When
      Object.assign(
        (kind === "matview" ? server.matviews : server.liveviews)[0],
        { view_status: status, invalidation_reason: reason },
      )
      await userEvent.click(get("schema-auto-refresh-button"))
      // Then
      await waitFor(() =>
        expect(
          get(`schema-${kind}-title`)
            .closest('[data-hook="schema-row"]')
            ?.querySelector('[data-hook="schema-row-error-icon"]'),
        ).toBeInTheDocument(),
      )
      await hover(get("schema-row-error-icon"))
      expect(get("tooltip")).toHaveTextContent(message)
      expect(get("tooltip")).not.toHaveTextContent("null")
      if (kind === "matview" && reason === null)
        expect(get("tooltip")).not.toHaveTextContent("invalid:")
    })
  }

  it("shows partition storage without a WAL row for a live view", async () => {
    // Given
    schemaServer()
    await mountSchema()
    await expand("live-views")
    // When
    await userEvent.dblClick(get("schema-liveview-title"))
    await userEvent.dblClick(screen.getByText("Storage details"))
    // Then
    expect(rowContaining("Partitioning:")).toHaveTextContent("By day")
    expect(screen.queryByText("WAL:")).not.toBeInTheDocument()
  })

  it("offers live-view details but no materialized-view creation action", async () => {
    // Given
    schemaServer()
    await mountSchema()
    await expand("live-views")
    // When
    fireEvent.contextMenu(get("schema-liveview-title"))
    // Then
    expect(get("table-context-menu-view-details")).toBeInTheDocument()
    expect(query("table-context-menu-create-matview")).not.toBeInTheDocument()
    // When
    await key("Escape")
    // Then
    expect(query("table-context-menu-view-details")).not.toBeInTheDocument()
  })

  it("passes the live-view kind from its row through the resume dialog to SQL", async () => {
    // Given
    const server = schemaServer()
    server.tables.find(
      (row) => row.table_name === "btc_trades_lv",
    )!.table_suspended = true
    await mountSchema()
    await expand("live-views")
    // When
    fireEvent.contextMenu(get("schema-liveview-title"))
    await userEvent.click(get("table-context-menu-resume-wal"))
    // Then
    expect(get("schema-suspension-dialog")).toHaveAttribute(
      "data-table-name",
      "btc_trades_lv",
    )
    // When
    await userEvent.click(get("schema-suspension-dialog-restart-transaction"))
    // Then
    await waitFor(() =>
      expect(server.queries).toContain(
        "ALTER LIVE VIEW 'btc_trades_lv' RESUME WAL",
      ),
    )
    await waitFor(() =>
      expect(get("schema-suspension-dialog")).toHaveTextContent("successfully"),
    )
    // When
    await userEvent.click(get("schema-suspension-dialog-dismiss"))
    // Then
    expect(query("schema-suspension-dialog")).not.toBeInTheDocument()
  })
})

describe("materialized view creation eligibility", () => {
  for (const [name, overrides] of [
    ["no_wal", { walEnabled: false }],
    ["no_timestamp", { designatedTimestamp: "", partitionBy: "NONE" }],
  ] as const) {
    it(`blocks creation from ${name} without requesting DDL`, async () => {
      // Given
      const server = schemaServer()
      server.tables = [table("eligible"), { ...table(name), ...overrides }]
      await mountSchema()
      // When
      fireEvent.contextMenu(tableTitle(name))
      // Then
      expect(get("table-context-menu-create-matview")).toHaveAttribute(
        "data-disabled",
      )
      expect(get("table-context-menu-create-matview")).toHaveAttribute(
        "aria-disabled",
        "true",
      )
      // When
      await expect(
        userEvent.click(get("table-context-menu-create-matview")),
      ).rejects.toThrow("pointer-events")
      await key("Escape")
      // Then
      expect(
        server.queries.filter((sql) => sql.startsWith("SHOW CREATE")),
      ).toHaveLength(0)
      // When
      fireEvent.contextMenu(tableTitle("eligible"))
      // Then
      expect(get("table-context-menu-create-matview")).not.toHaveAttribute(
        "data-disabled",
      )
    })
  }
})
