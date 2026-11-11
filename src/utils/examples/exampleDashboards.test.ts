import { describe, expect, it, vi } from "vitest"

// Same stubs as importTabs.test.ts: keep React and Monaco out of a pure test.
vi.mock("../../store/buffers", () => ({
  defaultEditorViewState: {},
}))
vi.mock("../../scenes/Editor/Monaco/index", () => ({
  LINE_NUMBER_HARD_LIMIT: 99999,
}))

import {
  fetchExampleDashboard,
  parseExampleDashboard,
} from "./exampleDashboards"

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
    const content = await parseExampleDashboard([row])

    // Then it validates as a notebook and the placeholders are gone
    expect(content.label).toBe("Trades")
    expect(content.notebookViewState.cells[0].result).toBeUndefined()
  })

  it("drops persisted results and run markers so every cell starts fresh", async () => {
    const content = await parseExampleDashboard([notebookRow()])
    const [grid, chart] = content.notebookViewState.cells
    expect(grid.result).toBeUndefined()
    expect(grid.lastRunStatus).toBeUndefined()
    expect(chart.mode).toBe("draw")
  })

  it("accepts a plain tab row without value/position", async () => {
    const content = await parseExampleDashboard([
      {
        label: "Minimal",
        notebookViewState: {
          cells: [{ id: "a", position: 0, value: "select 1" }],
        },
      },
    ])
    expect(content.label).toBe("Minimal")
  })

  it("rejects a file without a notebook", async () => {
    await expect(
      parseExampleDashboard([
        { label: "Query", value: "select 1", position: 0, editorViewState: {} },
      ]),
    ).rejects.toThrow("no notebook tab")
  })

  it("rejects an invalid notebook", async () => {
    await expect(
      parseExampleDashboard([
        notebookRow({ notebookViewState: { cells: [{ id: "", value: "x" }] } }),
      ]),
    ).rejects.toThrow("Invalid example dashboard")
  })
})

describe("fetchExampleDashboard", () => {
  it("fetches the path relative to the console root", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([notebookRow()]), { status: 200 }),
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
