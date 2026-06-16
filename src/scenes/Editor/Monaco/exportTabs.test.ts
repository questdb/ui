import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the Dexie db and export-import lib so importing the module under test
// does not touch IndexedDB. db exposes a few tables so we can assert skipTables.
vi.mock("../../../store/db", () => ({
  db: {
    tables: [
      { name: "buffers" },
      { name: "editor_settings" },
      { name: "notebook_results" },
    ],
  },
}))
type ExportOpts = {
  skipTables: string[]
  filter: (table: string, value: unknown) => boolean
}
const { exportDB } = vi.hoisted(() => ({
  exportDB: vi.fn((_db: unknown, _options: ExportOpts) =>
    Promise.resolve(new Blob(["{}"])),
  ),
}))
vi.mock("dexie-export-import", () => ({ exportDB }))

import {
  shouldExportBuffer,
  buildExportFileName,
  reconcileRowCounts,
  exportBuffers,
} from "./exportTabs"

describe("shouldExportBuffer", () => {
  it("includes a normal buffer when no bufferId is given", () => {
    expect(shouldExportBuffer({ id: 1 })).toBe(true)
  })

  it("excludes temporary and preview buffers", () => {
    expect(shouldExportBuffer({ id: 1, isTemporary: true })).toBe(false)
    expect(shouldExportBuffer({ id: 1, isPreviewBuffer: true })).toBe(false)
  })

  it("keeps only the matching buffer when a bufferId is given", () => {
    expect(shouldExportBuffer({ id: 7 }, { bufferId: 7 })).toBe(true)
    expect(shouldExportBuffer({ id: 8 }, { bufferId: 7 })).toBe(false)
  })

  it("excludes temporary/preview even when their id matches the bufferId", () => {
    expect(
      shouldExportBuffer({ id: 7, isTemporary: true }, { bufferId: 7 }),
    ).toBe(false)
    expect(
      shouldExportBuffer({ id: 7, isPreviewBuffer: true }, { bufferId: 7 }),
    ).toBe(false)
  })

  it("treats bufferId 0 as a real target (not 'no filter')", () => {
    expect(shouldExportBuffer({ id: 0 }, { bufferId: 0 })).toBe(true)
    expect(shouldExportBuffer({ id: 1 }, { bufferId: 0 })).toBe(false)
  })
})

describe("buildExportFileName", () => {
  const timestamp = "2026-06-16T10:30:45.123Z"

  it("uses the 'tabs' segment for a full export", () => {
    expect(buildExportFileName(undefined, timestamp)).toBe(
      "questdb-tabs-2026-06-16T10-30-45-123Z.json",
    )
  })

  it("uses the 'notebook' segment for a single-notebook export", () => {
    expect(buildExportFileName({ bufferId: 3 }, timestamp)).toBe(
      "questdb-notebook-2026-06-16T10-30-45-123Z.json",
    )
  })

  it("sanitizes colons and dots out of the timestamp", () => {
    const name = buildExportFileName({ bufferId: 0 }, timestamp)
    expect(name).not.toContain(":")
    // The only remaining dot should be the `.json` extension.
    expect(name.replace(/\.json$/, "")).not.toContain(".")
  })
})

describe("reconcileRowCounts", () => {
  it("rewrites an overstated rowCount to the rows actually exported", () => {
    const json = {
      data: {
        tables: [{ name: "buffers", rowCount: 42 }],
        data: [{ tableName: "buffers", rows: [{ id: 1 }] }],
      },
    }
    reconcileRowCounts(json)
    expect(json.data.tables[0].rowCount).toBe(1)
  })

  it("reconciles each table independently", () => {
    const json = {
      data: {
        tables: [
          { name: "buffers", rowCount: 99 },
          { name: "settings", rowCount: 99 },
        ],
        data: [
          { tableName: "buffers", rows: [{}, {}] },
          { tableName: "settings", rows: [] },
        ],
      },
    }
    reconcileRowCounts(json)
    expect(json.data.tables.map((t) => t.rowCount)).toEqual([2, 0])
  })

  it("leaves a table untouched when it has no data entry", () => {
    const json = {
      data: {
        tables: [{ name: "buffers", rowCount: 5 }],
        data: [{ tableName: "other", rows: [{}] }],
      },
    }
    reconcileRowCounts(json)
    expect(json.data.tables[0].rowCount).toBe(5)
  })

  it("returns the input unchanged when the structure is missing", () => {
    expect(reconcileRowCounts({})).toEqual({})
    expect(reconcileRowCounts({ data: {} })).toEqual({ data: {} })
  })
})

describe("exportBuffers wiring", () => {
  beforeEach(() => {
    exportDB.mockClear()
    // Stub the DOM download plumbing (test env is node, not jsdom).
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:stub"),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ click: vi.fn() })),
    })
  })

  it("skips every table except 'buffers'", async () => {
    await exportBuffers()
    const [, options] = exportDB.mock.calls[0]
    expect(options.skipTables).toEqual(["editor_settings", "notebook_results"])
  })

  it("forwards the bufferId into the filter handed to exportDB", async () => {
    await exportBuffers({ bufferId: 7 })
    const [, options] = exportDB.mock.calls[0]
    // The filter exportDB receives must reflect the single-notebook scope.
    expect(options.filter("buffers", { id: 7 })).toBe(true)
    expect(options.filter("buffers", { id: 8 })).toBe(false)
  })

  it("writes a corrected rowCount into the downloaded file", async () => {
    let captured: Blob | undefined
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((b: Blob) => {
        captured = b
        return "blob:stub"
      }),
      revokeObjectURL: vi.fn(),
    })
    // exportDB stamps rowCount 50 but only one row is actually emitted.
    exportDB.mockResolvedValueOnce(
      new Blob([
        JSON.stringify({
          data: {
            tables: [{ name: "buffers", rowCount: 50 }],
            data: [{ tableName: "buffers", rows: [{ id: 1 }] }],
          },
        }),
      ]),
    )

    await exportBuffers({ bufferId: 1 })

    const text = await (captured as Blob).text()
    const parsed = JSON.parse(text) as {
      data: { tables: Array<{ rowCount: number }> }
    }
    expect(parsed.data.tables[0].rowCount).toBe(1)
  })
})
