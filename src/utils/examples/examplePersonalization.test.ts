import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import type { NotebookViewState } from "../../store/notebook"
import { examplePersonalizationReason } from "./examplePersonalization"

const view = (): NotebookViewState => ({
  cells: [
    {
      id: "a",
      position: 0,
      value: "select 1",
      topHeight: 176,
      bottomHeight: 320,
    },
    {
      id: "b",
      position: 1,
      value: "select 2",
      topHeight: 176,
      bottomHeight: 320,
    },
  ],
  settings: {
    layoutMode: "grid",
    variables: [{ name: "symbol", value: "'BTC-USDT'" }],
    layout: [
      { i: "a", x: 0, y: 0, w: 6, h: 1 },
      { i: "b", x: 6, y: 0, w: 6, h: 1 },
    ],
  },
})
const original = (): Buffer => ({
  label: "Example",
  value: "",
  position: 0,
  templateId: "trades",
  notebookViewState: view(),
})

describe("example personalization", () => {
  it("ignores execution, focus, inspection and automatic pane/grid sizing", () => {
    const next = view()
    next.focusedCellId = "b"
    next.maximizedCellId = "a"
    next.cells[0] = {
      ...next.cells[0],
      lastRunStatus: "success",
      paneView: "result",
      topHeight: 248,
      bottomHeight: 360,
    }
    next.settings!.layout = next
      .settings!.layout!.map((item) => ({ ...item, y: 8, h: 20 }))
      .reverse()
    expect(
      examplePersonalizationReason(original(), { notebookViewState: next }),
    ).toBeUndefined()
  })

  it.each([
    [
      "SQL",
      (v: NotebookViewState) => {
        v.cells[0].value = "select 42"
      },
    ],
    [
      "variables",
      (v: NotebookViewState) => {
        v.settings!.variables![0].value = "'SOL-USDT'"
      },
    ],
    [
      "refresh",
      (v: NotebookViewState) => {
        v.cells[0].autoRefresh = "5s"
      },
    ],
    [
      "manual resize",
      (v: NotebookViewState) => {
        v.cells[0].topResized = true
        v.cells[0].topHeight = 248
      },
    ],
    [
      "column width",
      (v: NotebookViewState) => {
        v.settings!.layout![0].w = 12
      },
    ],
    [
      "row move",
      (v: NotebookViewState) => {
        v.settings!.layout![1].y = 1
      },
    ],
    [
      "new cell",
      (v: NotebookViewState) => {
        v.cells.push({ id: "c", position: 2, value: "" })
      },
    ],
    [
      "cell removal",
      (v: NotebookViewState) => {
        v.cells.pop()
      },
    ],
  ] as const)("keeps %s edits as a personal notebook", (_label, mutate) => {
    const next = view()
    mutate(next)
    expect(
      examplePersonalizationReason(original(), { notebookViewState: next }),
    ).toBe("content")
  })

  it("promotes only an actual rename, and never re-promotes a personal notebook", () => {
    expect(
      examplePersonalizationReason(original(), { label: "Example" }),
    ).toBeUndefined()
    expect(
      examplePersonalizationReason(original(), { label: "My dashboard" }),
    ).toBe("rename")
    expect(
      examplePersonalizationReason(
        { ...original(), templateId: undefined },
        { label: "Renamed again" },
      ),
    ).toBeUndefined()
  })
})
