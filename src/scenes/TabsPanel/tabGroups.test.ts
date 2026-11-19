import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import { buildTabGroups, groupCountLabel } from "./tabGroups"

const sql = (id: number, label: string, extra: Partial<Buffer> = {}) =>
  ({
    id,
    label,
    value: "",
    position: id,
    editorViewState: {},
    ...extra,
  }) as Buffer
const notebook = (id: number, label: string, extra: Partial<Buffer> = {}) =>
  ({
    id,
    label,
    value: "",
    position: id,
    notebookViewState: { cells: [] },
    ...extra,
  }) as Buffer
const metrics = (id: number, label: string, extra: Partial<Buffer> = {}) =>
  ({
    id,
    label,
    value: "",
    position: id,
    metricsViewState: { metrics: [] },
    ...extra,
  }) as Buffer
const closed = (archivedAt: number): Partial<Buffer> => ({
  archived: true,
  archivedAt,
  position: -1,
})

const labels = (groups: ReturnType<typeof buildTabGroups>) =>
  groups.map((g) => [g.title, g.rows.map((b) => b.label)])

describe("buildTabGroups", () => {
  it("groups by kind in Notebooks, Editors, Metrics order and hides empty folders", () => {
    const groups = buildTabGroups(
      [sql(1, "Q1"), notebook(2, "A"), sql(3, "Q2")],
      { includeClosed: false, filter: "" },
    )
    expect(labels(groups)).toEqual([
      ["Notebooks", ["A"]],
      ["Editors", ["Q1", "Q2"]],
    ])
  })

  it("orders open tabs by position, then closed tabs newest first", () => {
    // Given A, B open (B before A in the bar), C closed 2m ago, D closed 5m ago
    const now = 1_000_000
    const groups = buildTabGroups(
      [
        notebook(1, "A", { position: 1 }),
        notebook(2, "B", { position: 0 }),
        notebook(3, "C", closed(now - 2 * 60_000)),
        notebook(4, "D", closed(now - 5 * 60_000)),
      ],
      { includeClosed: true, filter: "" },
    )
    expect(labels(groups)).toEqual([["Notebooks", ["B", "A", "C", "D"]]])
    expect(groups[0].openCount).toBe(2)
    expect(groups[0].closedCount).toBe(2)
  })

  it("hides closed tabs by default, and a folder with only closed tabs", () => {
    const groups = buildTabGroups(
      [sql(1, "Q1"), metrics(2, "CPU", closed(5))],
      { includeClosed: false, filter: "" },
    )
    expect(labels(groups)).toEqual([["Editors", ["Q1"]]])
  })

  it("always shows the previewed closed tab", () => {
    const groups = buildTabGroups(
      [sql(1, "Q1"), sql(2, "Old", { ...closed(5), isTemporary: true })],
      { includeClosed: false, filter: "" },
    )
    expect(labels(groups)).toEqual([["Editors", ["Q1", "Old"]]])
  })

  it("never lists the AI diff tab", () => {
    const groups = buildTabGroups(
      [sql(1, "Q1"), sql(2, "AI Suggestion", { isPreviewBuffer: true })],
      { includeClosed: true, filter: "" },
    )
    expect(labels(groups)).toEqual([["Editors", ["Q1"]]])
  })

  it("leaves notebooks opened from an example dashboard to the Examples folder", () => {
    const groups = buildTabGroups(
      [sql(1, "Q1"), notebook(2, "Trades", { templateId: "trades" })],
      { includeClosed: true, filter: "" },
    )
    expect(labels(groups)).toEqual([["Editors", ["Q1"]]])
  })

  it("filters by label, case-insensitive, across all folders", () => {
    const groups = buildTabGroups(
      [sql(1, "Trades query"), notebook(2, "trades dash"), metrics(3, "CPU")],
      { includeClosed: false, filter: " TRADES " },
    )
    expect(labels(groups)).toEqual([
      ["Notebooks", ["trades dash"]],
      ["Editors", ["Trades query"]],
    ])
  })
})

describe("groupCountLabel", () => {
  it("shows a single number when closed tabs are hidden", () => {
    expect(groupCountLabel({ openCount: 2, closedCount: 3 }, false)).toBe("2")
  })

  it("shows open and closed counts when closed tabs are included", () => {
    expect(groupCountLabel({ openCount: 2, closedCount: 3 }, true)).toBe(
      "2 open · 3 closed",
    )
  })
})
