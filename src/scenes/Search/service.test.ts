import { describe, it, expect } from "vitest"
import {
  SearchService,
  getNotebookCellSearchTargets,
  toNotebookSearchMatch,
} from "./service"
import type { Buffer } from "../../store/buffers"
import type { NotebookCell, NotebookViewState } from "../../store/notebook"
import type { TextMatch } from "../../utils/textSearch"

const cell = (overrides: Partial<NotebookCell>): NotebookCell => ({
  id: "cell-1",
  position: 0,
  value: "",
  ...overrides,
})

const notebookBuffer = (
  cells: NotebookCell[],
  overrides: Partial<Buffer> = {},
): Buffer => ({
  id: 1,
  label: "Trades dashboard",
  value: "",
  position: 0,
  notebookViewState: { cells } as NotebookViewState,
  ...overrides,
})

describe("getNotebookCellSearchTargets", () => {
  it("returns the SQL source as a single 'cell' target", () => {
    // Given a SQL cell with query text
    const sqlCell = cell({ value: "SELECT price FROM trades" })

    // When the searchable targets are derived
    const targets = getNotebookCellSearchTargets(sqlCell)

    // Then there is one 'cell' target typed as SQL
    expect(targets).toEqual([
      {
        text: "SELECT price FROM trades",
        notebookField: "cell",
        cellType: "sql",
      },
    ])
  })

  it("returns the markdown source typed as 'markdown'", () => {
    // Given a markdown cell
    const mdCell = cell({ type: "markdown", value: "## Price notes" })

    // When the searchable targets are derived
    const targets = getNotebookCellSearchTargets(mdCell)

    // Then the single target is typed as markdown
    expect(targets).toEqual([
      { text: "## Price notes", notebookField: "cell", cellType: "markdown" },
    ])
  })

  it("adds a 'chartName' target after the cell value when a chart name exists", () => {
    // Given a SQL cell that also has a named chart
    const chartCell = cell({
      value: "SELECT price FROM trades",
      chartConfig: { xColumn: null, name: "BTC price", queries: [] },
    })

    // When the searchable targets are derived
    const targets = getNotebookCellSearchTargets(chartCell)

    // Then the cell value comes first, then the chart name
    expect(targets).toEqual([
      {
        text: "SELECT price FROM trades",
        notebookField: "cell",
        cellType: "sql",
      },
      { text: "BTC price", notebookField: "chartName", cellType: "sql" },
    ])
  })

  it("skips an empty value but still surfaces a chart name", () => {
    // Given a cell whose query is empty but whose chart is named
    const chartOnly = cell({
      value: "",
      chartConfig: { xColumn: null, name: "BTC price", queries: [] },
    })

    // When the searchable targets are derived
    const targets = getNotebookCellSearchTargets(chartOnly)

    // Then only the chart name target is produced
    expect(targets).toEqual([
      { text: "BTC price", notebookField: "chartName", cellType: "sql" },
    ])
  })

  it("returns nothing for an empty cell with no chart", () => {
    // Given an empty cell
    const empty = cell({ value: "" })

    // When the searchable targets are derived
    // Then there are no targets
    expect(getNotebookCellSearchTargets(empty)).toEqual([])
  })
})

describe("toNotebookSearchMatch", () => {
  it("maps a worker TextMatch to a notebook-tagged SearchMatch", () => {
    // Given a buffer, cell, target and a raw text match
    const buffer = notebookBuffer([], { id: 7, label: "Dash", archived: true })
    const sqlCell = cell({ id: "cell-42" })
    const textMatch: TextMatch = {
      startOffset: 7,
      endOffset: 12,
      lineNumber: 1,
      column: 8,
      endLineNumber: 1,
      endColumn: 13,
      text: "price",
      previewText: "SELECT price FROM",
      matchStartInPreview: 7,
      matchEndInPreview: 12,
    }

    // When it is mapped
    const match = toNotebookSearchMatch(
      buffer,
      sqlCell,
      { notebookField: "cell", cellType: "sql" },
      textMatch,
    )

    // Then it carries the notebook addressing and the match range
    expect(match).toMatchObject({
      bufferId: 7,
      bufferLabel: "Dash",
      isNotebookMatch: true,
      isArchived: true,
      cellId: "cell-42",
      cellType: "sql",
      notebookField: "cell",
      text: "price",
      previewText: "SELECT price FROM",
      range: {
        startLineNumber: 1,
        startColumn: 8,
        endLineNumber: 1,
        endColumn: 13,
      },
    })
    expect(match.isMetricsMatch).toBeUndefined()
  })
})

describe("SearchService.searchInSingleBuffer (notebook)", () => {
  const search = (buffer: Buffer, query: string, maxMatches = 10000) =>
    SearchService.searchInSingleBuffer(
      buffer,
      query,
      {},
      new AbortController().signal,
      "test-search",
      maxMatches,
    )

  it("finds matches in SQL, markdown and chart-name fields, tagged as notebook", async () => {
    // Given a notebook with the query term in a SQL cell, a markdown cell and a chart name
    const buffer = notebookBuffer([
      cell({ id: "sql-cell", value: "SELECT price FROM trades" }),
      cell({ id: "md-cell", type: "markdown", value: "## Price notes" }),
      cell({
        id: "chart-cell",
        value: "SELECT ts, last FROM trades",
        chartConfig: { xColumn: null, name: "BTC price", queries: [] },
      }),
    ])

    // When searching for "price"
    const matches = await search(buffer, "price")

    // Then every match is a notebook match, never a metrics match
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((m) => m.isNotebookMatch)).toBe(true)
    expect(matches.some((m) => m.isMetricsMatch)).toBe(false)

    // And each field surfaces with the right cell addressing
    const byField = matches.map((m) => ({
      cellId: m.cellId,
      cellType: m.cellType,
      notebookField: m.notebookField,
    }))
    expect(byField).toEqual(
      expect.arrayContaining([
        { cellId: "sql-cell", cellType: "sql", notebookField: "cell" },
        { cellId: "md-cell", cellType: "markdown", notebookField: "cell" },
        { cellId: "chart-cell", cellType: "sql", notebookField: "chartName" },
      ]),
    )
  })

  it("matches the notebook title and tags it as a notebook title match", async () => {
    // Given a notebook whose label contains the query term
    const buffer = notebookBuffer([cell({ value: "SELECT 1" })], {
      label: "Price board",
    })

    // When searching for the term in the title
    const matches = await search(buffer, "Price")

    // Then a title match is produced and tagged as a notebook match
    const titleMatch = matches.find((m) => m.isTitleMatch)
    expect(titleMatch).toBeDefined()
    expect(titleMatch?.isNotebookMatch).toBe(true)
  })

  it("respects the match capacity limit", async () => {
    // Given a notebook with several occurrences of the term
    const buffer = notebookBuffer([
      cell({ id: "c1", value: "price price price" }),
      cell({ id: "c2", value: "price price price" }),
    ])

    // When searching with a capacity of 2
    const matches = await search(buffer, "price", 2)

    // Then no more than 2 matches are returned
    expect(matches.length).toBeLessThanOrEqual(2)
  })

  it("stops before the chart-name target once capacity is reached", async () => {
    // Given a SQL cell whose value fills capacity and that also has a named chart
    const buffer = notebookBuffer([
      cell({
        id: "c1",
        value: "price price price",
        chartConfig: { xColumn: null, name: "price chart", queries: [] },
      }),
    ])

    // When searching with a capacity of 2
    const matches = await search(buffer, "price", 2)

    // Then capacity is filled by the cell value and the chart name is never reached
    expect(matches).toHaveLength(2)
    expect(matches.every((m) => m.notebookField === "cell")).toBe(true)
  })

  it("returns no content matches for a notebook with no cells", async () => {
    // Given an empty notebook whose title still matches
    const buffer = notebookBuffer([], { label: "Empty board" })

    // When searching for a term present only in the title
    const matches = await search(buffer, "board")

    // Then the only match is the title match
    expect(matches).toHaveLength(1)
    expect(matches[0].isTitleMatch).toBe(true)
  })
})
