import { beforeAll, describe, expect, it, vi } from "vitest"

// Same stubs as importTabs.test.ts: keep React and Monaco out of a pure test.
vi.mock("../../store/buffers", () => ({
  defaultEditorViewState: {},
}))
vi.mock("../../scenes/Editor/Monaco/index", () => ({
  LINE_NUMBER_HARD_LIMIT: 99999,
}))
// The console's database version is 10 here; a file written at 10 is not
// migrated, an older one goes through migrateBuffer like a tab import.
const migrations = vi.hoisted(() => ({
  getCurrentDbVersion: () => 10,
  migrateBuffer: vi.fn(
    (row: Record<string, unknown>, from: number, to: number) => ({
      ...row,
      label: `${row.label as string} (migrated ${from}→${to})`,
    }),
  ),
}))
vi.mock("../../store/migrations", () => migrations)

import {
  fetchExampleDashboard,
  parseExampleDashboard,
} from "./exampleDashboards"

// parseExampleDashboard loads importTabs on demand. The first, cold import
// takes seconds under a full parallel run; load it once up front, with its own
// timeout, so no test pays for it within the default 5 s.
beforeAll(async () => {
  await import("../../scenes/Editor/Monaco/importTabs")
}, 30_000)

// A console tab export holding `rows`, written at database `version`.
const exportFile = (rows: unknown[], version = 10) => ({
  formatName: "dexie",
  data: {
    databaseVersion: version,
    data: [{ tableName: "buffers", rows }],
  },
})

const notebookRow = (extra: Record<string, unknown> = {}) => ({
  label: "Trades",
  value: "",
  position: 0,
  notebookViewState: {
    cells: [
      {
        id: "c1",
        position: 0,
        value: "select * from trades limit 10",
        result: { rows: [[1]] },
        lastRunStatus: "success",
      },
      {
        id: "c2",
        position: 1,
        value: "select count() from trades",
        mode: "draw",
      },
    ],
    settings: { autoRefreshDefault: "5s" },
  },
  ...extra,
})

describe("parseExampleDashboard", () => {
  it("reads the first notebook tab out of a console export file", async () => {
    // Given an export envelope with a SQL tab before the notebook
    const file = {
      formatName: "dexie",
      data: {
        databaseVersion: 10,
        data: [
          {
            tableName: "buffers",
            rows: [
              {
                label: "Query",
                value: "select 1",
                position: 0,
                editorViewState: {},
              },
              notebookRow(),
            ],
          },
        ],
      },
    }

    // When it is parsed
    const content = await parseExampleDashboard(file)

    // Then the notebook is returned with fresh cells
    expect(content.label).toBe("Trades")
    expect(content.notebookViewState.cells.map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ])
    expect(content.notebookViewState.settings?.autoRefreshDefault).toBe("5s")
  })

  it("decodes typeson placeholders written by the console export", async () => {
    // Given an exported row where undefined fields are 0 + a $types entry
    const row = {
      ...notebookRow(),
      editorViewState: 0,
      metricsViewState: 0,
      archived: 0,
      $types: {
        editorViewState: "undef",
        metricsViewState: "undef",
        archived: "undef",
        "notebookViewState.cells.0.result": "undef",
        "notebookViewState.cells": "arrayNonindexKeys",
      },
    }
    row.notebookViewState.cells[0].result = 0 as never

    // When it is parsed
    const content = await parseExampleDashboard(exportFile([row]))

    // Then it validates as a notebook and the placeholders are gone
    expect(content.label).toBe("Trades")
    expect(content.notebookViewState.cells[0].result).toBeUndefined()
  })

  it("drops persisted results and run markers so every cell starts fresh", async () => {
    const content = await parseExampleDashboard(exportFile([notebookRow()]))
    const [grid, chart] = content.notebookViewState.cells
    expect(grid.result).toBeUndefined()
    expect(grid.lastRunStatus).toBeUndefined()
    expect(chart.mode).toBe("draw")
  })

  it("accepts a tab row without value/position", async () => {
    const content = await parseExampleDashboard(
      exportFile([
        {
          label: "Minimal",
          notebookViewState: {
            cells: [{ id: "a", position: 0, value: "select 1" }],
          },
        },
      ]),
    )
    expect(content.label).toBe("Minimal")
  })

  it("migrates a file written by an older console, like a tab import", async () => {
    // Given an export written at database version 8 (the console is at 10)
    migrations.migrateBuffer.mockClear()

    // When it is parsed
    const content = await parseExampleDashboard(exportFile([notebookRow()], 8))

    // Then the row went through the same migration steps as an import
    expect(migrations.migrateBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Trades" }),
      8,
      10,
    )
    expect(content.label).toBe("Trades (migrated 8→10)")
  })

  it("does not migrate a file written at the console's version", async () => {
    migrations.migrateBuffer.mockClear()
    await parseExampleDashboard(exportFile([notebookRow()], 10))
    expect(migrations.migrateBuffer).not.toHaveBeenCalled()
  })

  it("rejects a file that is not a console export", async () => {
    // A plain list of tab rows carries no database version to migrate from
    await expect(parseExampleDashboard([notebookRow()])).rejects.toThrow(
      "not a console tab export",
    )
    await expect(
      parseExampleDashboard({ formatName: "dexie", data: { data: [] } }),
    ).rejects.toThrow("not a console tab export")
  })

  it("rejects a file without a notebook", async () => {
    await expect(
      parseExampleDashboard(
        exportFile([
          {
            label: "Query",
            value: "select 1",
            position: 0,
            editorViewState: {},
          },
        ]),
      ),
    ).rejects.toThrow("no notebook tab")
  })

  it("rejects an invalid notebook", async () => {
    await expect(
      parseExampleDashboard(
        exportFile([
          notebookRow({
            notebookViewState: { cells: [{ id: "", value: "x" }] },
          }),
        ]),
      ),
    ).rejects.toThrow("Invalid example dashboard")
  })
})

describe("fetchExampleDashboard", () => {
  it("fetches the path relative to the console root", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(exportFile([notebookRow()])), {
          status: 200,
        }),
      ),
    ) as unknown as typeof fetch
    const content = await fetchExampleDashboard(
      "assets/examples/t.json",
      fetchFn,
    )
    expect(fetchFn).toHaveBeenCalledWith("assets/examples/t.json")
    expect(content.label).toBe("Trades")
  })

  it("fails on a non-200 response", async () => {
    const fetchFn = (() =>
      Promise.resolve(
        new Response("", { status: 404 }),
      )) as unknown as typeof fetch
    await expect(
      fetchExampleDashboard("assets/examples/missing.json", fetchFn),
    ).rejects.toThrow("404")
  })
})
