// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import isEqual from "lodash.isequal"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { Button } from "../../../components/Button"
import type { HighlightConfig } from "../../../components/ResultGrid/highlight"
import type {
  CellInteractions,
  DqlQueryResult,
  NotebookCell,
} from "../../../store/notebook"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  ColumnFormat,
  ColumnFormats,
} from "../../../utils/formats/columnFormat"
import type {
  ChartConfig,
  QueryChart,
  VisualConfig,
} from "./CellChart/chartTypes"
import { DrawSettingsDrawer } from "./CellChart/DrawSettingsDrawer"
import {
  draftOf,
  drawSettingsOf,
  settingsOf,
  starterCustomOption,
  supportsInteractions,
  type DrawDraft,
  type DrawSettings,
} from "./CellChart/drawSettings"
import { resolveDraw, type QueryTab } from "./DrawCanvas/drawCanvasUtils"
import type { StatementRows } from "./visuals/statementRows"
import {
  HighlightSettingsDrawer,
  type GridSettingsSave,
} from "./CellHighlight/HighlightSettingsDrawer"
import {
  cellColumnsOf,
  gridSettingsPatch,
  resolveHighlightConfig,
} from "./result-table/highlightConfig"
import { columnsAndSamplesOf } from "./CellFormats/formatSummary"
import { applyCellSettings, changedSettings } from "./cellSettings"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "./settingsDrawer/CellOverlayContext"

// Pattern guard for the settings drawers' saves: a save writes exactly what
// the user changed. Random saved cells (a preset with its per-type options, a
// component, a custom option; formats including shapes only an agent writes;
// interactions; highlight rules and identity; the grid's live mode) meet a
// random current result (none, no rows, rows lacking saved columns, every
// column, a row-capped prefix). Through each save path:
//
//   (a) Save without a change: nothing is written.
//   (b) One edit in one section, then Save: only that section's fields may
//       differ; every other field is deep-equal to before.

const VARIABLES = vi.hoisted(() => [
  { name: "sym_v", value: "'BTC'" },
  { name: "t_from", value: "now()" },
  { name: "t_to", value: "now()" },
])

vi.mock("./NotebookProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./NotebookProvider")>()),
  useNotebookSettings: () => ({ variables: VARIABLES }),
}))

vi.mock("@monaco-editor/react", () => ({
  loader: { init: () => new Promise(() => undefined), config: () => undefined },
  Editor: ({
    value,
    onChange,
    options,
  }: {
    value: string
    onChange: (v: string) => void
    options: { ariaLabel: string }
  }) => (
    <div className="monaco-editor">
      <textarea
        aria-label={options.ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}))

beforeAll(async () => {
  await import("./CellChart/CustomOptionSettings")
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

// ------------------------------------------------------------------------
// Seeded generation.

type Rng = {
  next: () => number
  int: (n: number) => number
  chance: (p: number) => boolean
  pick: <T>(xs: readonly T[]) => T
  some: <T>(xs: readonly T[]) => T[]
}

const rngOf = (seed: number): Rng => {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (xs) => xs[int(xs.length)],
    some: (xs) => xs.filter(() => next() < 0.5),
  }
}

const COLUMNS = [
  { name: "ts", type: "TIMESTAMP" },
  { name: "sym", type: "SYMBOL" },
  { name: "side", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
  { name: "qty", type: "LONG" },
  { name: "lo", type: "DOUBLE" },
  { name: "hi", type: "DOUBLE" },
]

const valueOf = (column: string, row: number): string | number => {
  switch (column) {
    case "ts":
      return new Date(Date.UTC(2026, 0, 1) + row * 60_000).toISOString()
    case "sym":
      return ["BTC", "ETH"][row % 2]
    case "side":
      return ["buy", "sell"][(row >> 1) % 2]
    case "lo":
      return 10 + row
    case "hi":
      return 20 + row
    default:
      return (row * 7) % 31
  }
}

const presetQuery = (r: Rng): QueryChart => {
  const type = r.pick([
    "line",
    "area",
    "stepLine",
    "bar",
    "stackedBar",
    "scatter",
    "pie",
    "band",
    "events",
  ] as const)
  if (type === "events")
    return {
      type,
      yColumns: [],
      ...(r.chance(0.6) ? { events: { time: "ts", label: "sym" } } : {}),
    }
  const ys = r.some(["price", "qty"])
  const q: QueryChart = { type, yColumns: ys.length > 0 ? ys : ["price"] }
  if ((type === "area" || type === "stackedBar") && r.chance(0.5))
    q.percentStack = true
  if (type === "pie") q.pieShape = r.pick(["pie", "donut", "halfDonut"])
  if (type === "scatter")
    q.scatter = {
      ...(r.chance(0.6) ? { size: "qty" } : {}),
      ...(r.chance(0.6) ? { color: "price" } : {}),
    }
  if (type === "band") q.band = { lower: "lo", upper: "hi" }
  if (type !== "pie" && type !== "band" && r.chance(0.3))
    q.partitionByColumn = "sym"
  if (r.chance(0.25)) q.axis = "right"
  if (r.chance(0.25)) q.name = "Series A"
  if (r.chance(0.15)) q.enabled = false
  return q
}

const presetOf = (r: Rng, statementCount: number): ChartConfig => {
  if (r.chance(0.15)) return { xColumn: null, queries: [] }
  const chart: ChartConfig = {
    xColumn: r.pick(["ts", "sym", null]),
    queries: Array.from({ length: statementCount }, () =>
      r.chance(0.2) ? null : presetQuery(r),
    ),
  }
  if (r.chance(0.3)) chart.rightAxis = { name: "Right", min: 0, max: 100 }
  if (r.chance(0.35)) chart.horizontal = true
  if (r.chance(0.3)) chart.thresholds = r.pick(["lines", "bands"])
  return chart
}

const visualOf = (r: Rng): VisualConfig => {
  const type = r.pick([
    "stat",
    "gauge",
    "uptime",
    "stateTimeline",
    "bullet",
    "planTree",
    "orderBook",
  ] as const)
  const visual: VisualConfig = { type }
  if (r.chance(0.6))
    visual.columns = {
      value: "price",
      ...(r.chance(0.5) ? { label: "sym" } : {}),
    }
  if (r.chance(0.5)) {
    visual.min = 0
    visual.max = 100
  }
  if (type === "uptime" && r.chance(0.6)) visual.buckets = 30
  if ((type === "uptime" || type === "stateTimeline") && r.chance(0.5))
    visual.severity = { up: "good", down: "bad" }
  return visual
}

const customOptionOf = (r: Rng): Record<string, unknown> => ({
  tooltip: { trigger: "axis" },
  xAxis: { type: "time" },
  yAxis: { type: "value", ...(r.chance(0.5) ? { min: 0 } : {}) },
  series: [
    { type: "line", datasetId: "q0", encode: { x: "ts", y: "price" } },
    ...(r.chance(0.5)
      ? [{ type: "bar", datasetId: "q0", encode: { x: "ts", y: "qty" } }]
      : []),
  ],
})

// Shapes the editor writes, and shapes only an agent (or an import) writes:
// the editor's tidy step would drop or rewrite these.
const FORMAT_SHAPES: ColumnFormat[] = [
  { kind: "number" },
  { decimals: 2 },
  { kind: "percent", decimals: 1 },
  { kind: "price", prefix: "$" },
  { kind: "bytes", compact: true },
  { visual: "bar" },
  // Agent-only shapes.
  { prefix: "" },
  {},
  {
    thresholds: [
      { value: 1, tone: "positive" },
      { value: 10, tone: "negative" },
    ],
    signTone: true,
  },
  {
    thresholds: [
      { value: 10, tone: "negative" },
      { value: 1, tone: "positive" },
    ],
  },
]

const formatsOf = (r: Rng): ColumnFormats | undefined => {
  if (r.chance(0.25)) return undefined
  const formats: ColumnFormats = {}
  for (const column of r.some(["price", "qty", "lo", "hi", "sym"]))
    formats[column] = r.pick(FORMAT_SHAPES)
  return Object.keys(formats).length > 0 ? formats : undefined
}

const interactionsOf = (r: Rng): CellInteractions | undefined =>
  r.pick([
    undefined,
    { click: { variable: "sym_v" } },
    { click: { variable: "sym_v", column: "sym" } },
    { brush: { from: "t_from", to: "t_to" } },
    {
      click: { variable: "sym_v", column: "sym" },
      brush: { from: "t_from", to: "t_to" },
    },
  ])

const highlightOf = (r: Rng): HighlightConfig | undefined => {
  if (r.chance(0.3)) return undefined
  // An explicit shared row key: the default identity of a full result, saved.
  const identityColumns = r.pick([["sym", "side"], ["sym"], ["ts"], []])
  const rules: HighlightConfig["rules"] = []
  if (identityColumns.length > 0 && r.chance(0.5))
    rules.push({
      id: "prev",
      kind: "previous",
      enabled: r.chance(0.8),
      target: { kind: "column", name: "price" },
      condition: { op: "changedBy", threshold: 5, unit: "percent" },
      appliesTo: "cell",
      display: "temporary",
      color: "dataSeries2",
    })
  if (r.chance(0.5))
    rules.push({
      id: "value",
      kind: "value",
      enabled: true,
      target: { kind: "column", name: "qty" },
      condition: { op: "gt", value: 10 },
      appliesTo: "row",
      display: "always",
      color: "dataNegative",
    })
  if (identityColumns.length > 0 && r.chance(0.3))
    rules.push({
      id: "new",
      kind: "newRow",
      enabled: true,
      display: "temporary",
      color: "dataPositive",
    })
  return { identityColumns, rules }
}

const RESULT_SHAPES = ["none", "empty", "lacking", "full", "capped"] as const
type ResultShape = (typeof RESULT_SHAPES)[number]

type World = {
  seed: number
  cell: NotebookCell
  statements: string[]
  shape: ResultShape
  results: QueryExecResult[]
}

const worldOf = (seed: number): World => {
  const r = rngOf(seed)
  const statements = Array.from(
    { length: 1 + r.int(2) },
    (_, i) => `SELECT * FROM t${i}`,
  )
  const preset = presetOf(r, statements.length)
  const kind = r.pick(["chart", "chart", "component", "custom"] as const)
  const underneath = r.chance(0.5) ? preset : { xColumn: null, queries: [] }
  const chartConfig: ChartConfig =
    kind === "chart"
      ? preset
      : kind === "component"
        ? { ...underneath, visual: visualOf(r) }
        : { ...underneath, custom: { option: customOptionOf(r) } }
  const formats = formatsOf(r)
  const interactions = interactionsOf(r)
  const highlightConfig = highlightOf(r)
  const gridMode = r.pick([undefined, "stable", "stream"] as const)
  const cell: NotebookCell = {
    id: "cell",
    position: 0,
    value: statements.join(";\n"),
    mode: "draw",
    ...(r.chance(0.9) ? { chartConfig } : {}),
    ...(formats ? { formats } : {}),
    ...(interactions ? { interactions } : {}),
    ...(highlightConfig ? { highlightConfig } : {}),
    ...(gridMode ? { gridMode } : {}),
  }
  const shape = r.pick(RESULT_SHAPES)
  const results: QueryExecResult[] =
    shape === "none"
      ? []
      : statements.map((query) => {
          const dropped =
            shape === "lacking"
              ? r.some(["ts", "side", "price", "qty", "lo", "hi"])
              : []
          const columns = COLUMNS.filter((c) => !dropped.includes(c.name))
          const rowCount = shape === "empty" ? 0 : 3 + r.int(4)
          const dataset = Array.from({ length: rowCount }, (_, row) =>
            columns.map((c) => valueOf(c.name, row)),
          )
          return {
            type: "dql",
            query,
            columns,
            dataset,
            count: shape === "capped" ? rowCount + 1000 : rowCount,
            timestamp: columns.findIndex((c) => c.name === "ts"),
          } as QueryExecResult
        })
  return { seed, cell, statements, shape, results }
}

// ------------------------------------------------------------------------
// How a save reaches the cell: DrawCanvas hands Cell the settings the Chart
// settings drawer changed; ResultGridPanel writes those the Grid settings
// drawer changed. The notebook writes them as a patch.

const persistDraw = (cell: NotebookCell, next: DrawSettings): NotebookCell =>
  applyCellSettings(cell, changedSettings(drawSettingsOf(cell), next))

const persistGrid = (
  cell: NotebookCell,
  save: GridSettingsSave,
): NotebookCell =>
  applyCellSettings(
    cell,
    gridSettingsPatch(
      {
        highlightConfig: cell.highlightConfig,
        formats: cell.formats,
        gridMode: cell.gridMode,
        interactions: cell.interactions,
      },
      save,
    ),
  )

// ------------------------------------------------------------------------
// The properties.

type Field = keyof NotebookCell

const SETTINGS_FIELDS: Field[] = [
  "chartConfig",
  "formats",
  "interactions",
  "highlightConfig",
  "gridMode",
]

// Fields that differ, compared as the notebook persists them.
const changedFields = (before: NotebookCell, after: NotebookCell): Field[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(
    (key) => !isEqual(before[key as Field], after[key as Field]),
  ) as Field[]
}

const settingsOfCell = (cell: NotebookCell) =>
  JSON.stringify(Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, cell[f]])))

// Every seed runs; the problems found are reported together, a few in full.
const tallyOf = () => {
  const problems: string[] = []
  const byField = new Map<string, number>()
  let saves = 0
  const report = (
    world: World,
    after: NotebookCell,
    fields: Field[],
    what: string,
  ) => {
    if (fields.length === 0) return
    for (const field of fields)
      byField.set(field, (byField.get(field) ?? 0) + 1)
    problems.push(
      `${what} — seed ${world.seed}, ${world.shape} result: ${fields.join(", ")} changed\n  before ${settingsOfCell(world.cell)}\n  after  ${settingsOfCell(after)}`,
    )
  }
  return {
    /** A save without a change: nothing is written. */
    unchanged: (world: World, after: NotebookCell) => {
      saves++
      const changed = changedFields(world.cell, after)
      report(
        world,
        after,
        changed.length === 0 && after !== world.cell
          ? ["(written back)" as Field]
          : changed,
        "no edit",
      )
    },
    /** One edit: only `allowed` fields may change. */
    only: (
      world: World,
      after: NotebookCell,
      allowed: Field[],
      edit: string,
      // A formats edit names its column: the others keep their saved format.
      column?: string,
    ) => {
      saves++
      const changed = changedFields(world.cell, after).filter(
        (f) => !allowed.includes(f),
      )
      const others =
        column === undefined
          ? []
          : [
              ...new Set([
                ...Object.keys(world.cell.formats ?? {}),
                ...Object.keys(after.formats ?? {}),
              ]),
            ].filter(
              (other) =>
                other !== column &&
                !isEqual(after.formats?.[other], world.cell.formats?.[other]),
            )
      report(
        world,
        after,
        [...changed, ...others.map((c) => `formats.${c}` as Field)],
        edit,
      )
    },
    done: (minSaves: number) => {
      expect(
        problems.slice(0, 3),
        `${problems.length} of ${saves} saves changed what the user did not (${[
          ...byField,
        ]
          .map(([field, n]) => `${field} ${n}`)
          .join(", ")})`,
      ).toEqual([])
      expect(saves).toBeGreaterThanOrEqual(minSaves)
    },
  }
}

// ------------------------------------------------------------------------
// Draw settings: the pure save.

type Resolved = {
  saved: DrawSettings
  effective: ChartConfig
  tabs: QueryTab[]
  statements: StatementRows[]
}

const resolvedOf = (world: World): Resolved => {
  const resolution = resolveDraw(
    world.statements,
    world.results,
    world.cell.chartConfig,
  )
  return {
    saved: drawSettingsOf(world.cell),
    effective: resolution.effectiveConfig,
    tabs: resolution.tabs,
    statements: world.results.map((r) => ({
      columns: r.columns,
      rows: r.dataset,
      ...(r.count > r.dataset.length ? { partial: true as const } : {}),
    })),
  }
}

// The drawer's save, without its checks.
const drawSave = (draft: DrawDraft, { saved, tabs }: Resolved) =>
  settingsOf(draft, saved, tabs)

type DraftEdit = {
  section: "chart" | "formats" | "interactions"
  name: string
  column?: string
  draft: DrawDraft
}

const draftEditOf = (
  r: Rng,
  draft: DrawDraft,
  resolved: Resolved,
): DraftEdit => {
  const section = r.pick(["chart", "formats", "interactions"] as const)
  if (section === "formats") {
    const column = r.pick(["price", "qty", "lo", "hi", "sym"])
    const formats = { ...draft.formats }
    const remove = formats[column] !== undefined && r.chance(0.5)
    if (remove) delete formats[column]
    else formats[column] = { ...formats[column], decimals: 3 }
    return {
      section,
      name: `${remove ? "remove" : "set"} the format of ${column}`,
      column,
      draft: {
        ...draft,
        formats: Object.keys(formats).length > 0 ? formats : undefined,
      },
    }
  }
  if (section === "interactions" && supportsInteractions(draft)) {
    const interactions: CellInteractions = { ...draft.interactions }
    if (interactions.click) delete interactions.click
    else interactions.click = { variable: "sym_v" }
    return {
      section,
      name: "toggle the click",
      draft: {
        ...draft,
        interactions:
          interactions.click || interactions.brush ? interactions : undefined,
      },
    }
  }
  // The chart section: another kind, or an edit within the kind.
  const kinds = (["chart", "component", "custom"] as const).filter(
    (k) => k !== draft.kind,
  )
  if (r.chance(0.4)) {
    const kind = r.pick(kinds)
    return {
      section: "chart",
      name: `switch to ${kind}`,
      draft: {
        ...draft,
        kind,
        visual:
          kind === "component" && !draft.visual
            ? { type: "stat" }
            : draft.visual,
        customJson:
          kind === "custom" && draft.customJson.trim() === ""
            ? JSON.stringify(
                starterCustomOption(draft.chart, resolved.tabs),
                null,
                2,
              )
            : draft.customJson,
      },
    }
  }
  if (draft.kind === "component" && draft.visual) {
    return {
      section: "chart",
      name: "set the component's buckets",
      draft: { ...draft, visual: { ...draft.visual, buckets: 12 } },
    }
  }
  if (draft.kind === "custom") {
    return {
      section: "chart",
      name: "edit the custom option",
      draft: {
        ...draft,
        customJson: JSON.stringify({ series: [{ type: "line" }] }),
      },
    }
  }
  const first = draft.chart.queries.findIndex((q) => q !== null)
  const chart: ChartConfig = r.pick([
    () => ({ ...draft.chart, horizontal: !draft.chart.horizontal }),
    () => ({ ...draft.chart, thresholds: "bands" as const }),
    () => ({
      ...draft.chart,
      queries: draft.chart.queries.map((q, i) =>
        i === first && q ? { ...q, type: "line" as const } : q,
      ),
    }),
  ])()
  return {
    section: "chart",
    name: "edit the preset",
    draft: { ...draft, chart, chartEdited: true },
  }
}

const SECTION_FIELDS = {
  chart: ["chartConfig"],
  formats: ["formats"],
  interactions: ["interactions"],
} satisfies Record<DraftEdit["section"], Field[]>

const SEEDS = 400

describe("a draw settings save (pure)", () => {
  // Before a save patched only edited sections, an unchanged save wrote the
  // preset the current result resolves to (a saved x-axis lost with no rows,
  // inferred series frozen into an empty preset), tidied agent-only formats
  // away, and dropped the saved clicks of a bullet or plan tree.
  it("writes the cell back as saved when nothing changed", () => {
    const tally = tallyOf()
    for (let seed = 1; seed <= SEEDS; seed++) {
      const world = worldOf(seed)
      const resolved = resolvedOf(world)
      const result = drawSave(
        draftOf(resolved.saved, resolved.effective),
        resolved,
      )
      if (!result.ok) continue
      tally.unchanged(world, persistDraw(world.cell, result.settings))
    }
    tally.done(SEEDS / 2)
  })

  // Before: an edit in Formats or Interactions also rewrote the preset from
  // the current result, and every save re-tidied the other columns' formats.
  it("changes only the section the user edited", () => {
    const tally = tallyOf()
    for (let seed = 1; seed <= SEEDS; seed++) {
      const world = worldOf(seed)
      const resolved = resolvedOf(world)
      const r = rngOf(seed * 7919)
      const edit = draftEditOf(
        r,
        draftOf(resolved.saved, resolved.effective),
        resolved,
      )
      const result = drawSave(edit.draft, resolved)
      if (!result.ok) continue
      // A switch to a component without clicks drops the cell's clicks.
      const allowed: Field[] = [
        ...SECTION_FIELDS[edit.section],
        ...(edit.section === "chart" && !supportsInteractions(edit.draft)
          ? (["interactions"] as const)
          : []),
      ]
      tally.only(
        world,
        persistDraw(world.cell, result.settings),
        allowed,
        edit.name,
        edit.column,
      )
    }
    tally.done(SEEDS / 2)
  })
})

// ------------------------------------------------------------------------
// Draw settings: through the drawer.

const DrawFixture = ({
  resolved,
  onSave,
}: {
  resolved: Resolved
  onSave: (next: DrawSettings) => void
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <DrawSettingsDrawer
          open={open}
          onClose={() => setOpen(false)}
          initialDraft={null}
          onDraftChange={() => undefined}
          appearInPlace
          tabs={resolved.tabs}
          saved={resolved.saved}
          effective={resolved.effective}
          statements={resolved.statements}
          onSave={onSave}
        />
      </CellOverlayProvider>
    </>
  )
}

const flush = () => act(() => Promise.resolve())

const pickMenuItem = async (trigger: HTMLElement, name: string | RegExp) => {
  await userEvent.click(trigger)
  await userEvent.click(screen.getByRole("menuitemradio", { name }))
}

type UiEdit = {
  section: DraftEdit["section"] | "highlights" | "gridMode"
  name: string
  column?: string
}

// One edit in the Formats section: remove a saved format, or give a column
// without one decimals.
const editFormats = async (
  r: Rng,
  drawer: HTMLElement,
  formats: ColumnFormats | undefined,
): Promise<UiEdit | null> => {
  await userEvent.click(within(drawer).getByRole("tab", { name: "Formats" }))
  const saved = Object.keys(formats ?? {})
  const add = within(drawer).queryByRole("button", {
    name: /^Format a column/,
  })
  if (saved.length > 0 && (!add || r.chance(0.5))) {
    const column = r.pick(saved)
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Remove the format of ${column}`,
      }),
    )
    return {
      section: "formats",
      name: `remove the format of ${column}`,
      column,
    }
  }
  if (!add) return null
  await userEvent.click(add)
  const options = screen.getAllByRole("menuitemradio")
  const option = r.pick(options)
  const column = option.textContent ?? ""
  await userEvent.click(option)
  const decimals = within(drawer).getAllByPlaceholderText("Auto")
  fireEvent.change(decimals[decimals.length - 1], { target: { value: "3" } })
  return { section: "formats", name: `format ${column}`, column }
}

// One edit in the Interactions section: a click turned off, or on with a
// variable of the notebook.
const editInteractions = async (
  drawer: HTMLElement,
  interactions: CellInteractions | undefined,
): Promise<UiEdit> => {
  await userEvent.click(
    within(drawer).getByRole("tab", { name: "Interactions" }),
  )
  fireEvent.click(
    within(drawer).getByRole("checkbox", { name: /A click sets/ }),
  )
  if (!interactions?.click)
    await pickMenuItem(
      within(drawer).getByRole("button", { name: /^Variable/ }),
      /^@sym_v/,
    )
  return {
    section: "interactions",
    name: interactions?.click ? "turn the click off" : "turn the click on",
  }
}

const drawerOf = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
  return screen.findByRole("dialog", { name: "Chart settings" })
}

const runDrawDrawer = async (
  world: World,
  edit: (
    drawer: HTMLElement,
    resolved: Resolved,
  ) => UiEdit | null | Promise<UiEdit | null>,
): Promise<{ after: NotebookCell; edit: UiEdit | null } | null> => {
  const resolved = resolvedOf(world)
  const onSave = vi.fn<[DrawSettings], void>()
  const view = renderComponent(
    <DrawFixture resolved={resolved} onSave={onSave} />,
  )
  try {
    const drawer = await drawerOf()
    const done = await edit(drawer, resolved)
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))
    await flush()
    const saved = onSave.mock.calls[0]?.[0]
    // A save the drawer's checks stop writes nothing.
    if (!saved) return null
    return { after: persistDraw(world.cell, saved), edit: done }
  } finally {
    view.unmount()
  }
}

const UI_SEEDS = 40
const UI_TIMEOUT = 60_000

describe("a draw settings save (drawer)", () => {
  // Before, as the pure save: the preset was rebuilt from the current result
  // and agent-only formats were tidied away.
  it(
    "writes the cell back as saved when nothing changed",
    async () => {
      const tally = tallyOf()
      for (let seed = 1; seed <= UI_SEEDS; seed++) {
        const world = worldOf(seed)
        const run = await runDrawDrawer(world, () => null)
        if (!run) continue
        tally.unchanged(world, run.after)
      }
      tally.done(UI_SEEDS / 2)
    },
    UI_TIMEOUT,
  )

  // Before: a Formats or Interactions save rewrote the preset (R41 #4/#5's
  // class), a kind switch tidied the formats.
  it(
    "changes only the section the user edited",
    async () => {
      const tally = tallyOf()
      for (let seed = 1; seed <= UI_SEEDS; seed++) {
        const world = worldOf(seed)
        const r = rngOf(seed * 104729)
        const run = await runDrawDrawer(world, async (drawer, resolved) => {
          const kind = world.cell.chartConfig?.visual
            ? "component"
            : world.cell.chartConfig?.custom
              ? "custom"
              : "chart"
          const visual = world.cell.chartConfig?.visual?.type
          const sections = [
            "chart",
            ...(kind !== "custom" ? ["formats"] : []),
            ...(visual !== "bullet" && visual !== "planTree"
              ? ["interactions"]
              : []),
          ]
          const section = r.pick(sections)
          if (section === "formats")
            return editFormats(r, drawer, resolved.saved.formats)
          if (section === "interactions")
            return editInteractions(drawer, resolved.saved.interactions)
          const to = r.pick(
            (["Chart", "Component", "Custom"] as const).filter(
              (k) => k.toLowerCase() !== kind,
            ),
          )
          fireEvent.click(within(drawer).getByRole("button", { name: to }))
          return { section: "chart", name: `switch to ${to}` }
        })
        if (!run?.edit) continue
        const { edit } = run
        // A switch to a component without clicks drops the cell's clicks.
        const clickless =
          run.after.chartConfig?.visual?.type === "bullet" ||
          run.after.chartConfig?.visual?.type === "planTree"
        const allowed: Field[] =
          edit.section === "chart"
            ? ["chartConfig", ...(clickless ? ["interactions" as const] : [])]
            : edit.section === "formats"
              ? ["formats"]
              : ["interactions"]
        tally.only(world, run.after, allowed, edit.name, edit.column)
      }
      tally.done(UI_SEEDS / 2)
    },
    UI_TIMEOUT,
  )
})

// ------------------------------------------------------------------------
// Grid settings: through the drawer (it has no pure save).

type GridProps = {
  data: DqlQueryResult
  cellColumns: { name: string; type: string }[]
}

// The grid a drawer opens from: the cell's active statement. A grid shows
// only once there is a result, so "none" is a result without rows.
const gridOf = (world: World): GridProps => {
  const results =
    world.results.length > 0
      ? world.results
      : [
          {
            type: "dql",
            query: world.statements[0],
            columns: COLUMNS,
            dataset: [],
            count: 0,
            timestamp: 0,
          } as QueryExecResult,
        ]
  const data = { ...results[0], type: "dql" } as DqlQueryResult
  return {
    data,
    cellColumns: cellColumnsOf(
      results.map((r) => ({ ...r, type: "dql" }) as DqlQueryResult),
    ),
  }
}

const GridFixture = ({
  world,
  onSave,
}: {
  world: World
  onSave: (next: GridSettingsSave) => void
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const { data, cellColumns } = gridOf(world)
  const saved = world.cell.highlightConfig
  const activeTypes = new Map(data.columns.map((c) => [c.name, c]))
  return (
    <>
      <Button onClick={() => setOpen(true)}>Grid settings</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          open={open}
          appearInPlace
          initialDraft={null}
          onDraftChange={() => undefined}
          columns={cellColumns}
          formatColumns={cellColumns.map((c) => activeTypes.get(c.name) ?? c)}
          columnRange={() => null}
          config={resolveHighlightConfig(saved, data)}
          formats={world.cell.formats}
          gridMode={world.cell.gridMode}
          interactions={world.cell.interactions}
          variables={VARIABLES}
          samples={
            columnsAndSamplesOf([{ columns: data.columns, rows: data.dataset }])
              .samples
          }
          defaultIdentity={
            resolveHighlightConfig(undefined, data).identityColumns
          }
          savedConfig={saved}
          duplicateCountOf={() => 0}
          onSave={onSave}
          onCancel={() => setOpen(false)}
        />
      </CellOverlayProvider>
    </>
  )
}

const runGridDrawer = async (
  world: World,
  edit: (
    drawer: HTMLElement,
  ) => UiEdit | null | "cleared" | Promise<UiEdit | null | "cleared">,
): Promise<{ after: NotebookCell; edit: UiEdit | null } | null> => {
  const onSave = vi.fn<[GridSettingsSave], void>()
  const view = renderComponent(<GridFixture world={world} onSave={onSave} />)
  try {
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Grid settings" })
    const done = await edit(drawer)
    if (done === "cleared") {
      // Clear rules saves on its own.
      await flush()
    } else {
      fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))
      await flush()
    }
    const saved = onSave.mock.calls[0]?.[0]
    if (!saved) return null
    return {
      after: persistGrid(world.cell, saved),
      edit:
        done === "cleared"
          ? { section: "highlights", name: "clear the rules" }
          : done,
    }
  } finally {
    view.unmount()
  }
}

describe("a grid settings save (drawer)", () => {
  // Before: agent-only formats (an empty format, an empty prefix, a sign tone
  // next to thresholds) were tidied on every save (R27 #10's class).
  it(
    "writes the cell back as saved when nothing changed",
    async () => {
      const tally = tallyOf()
      for (let seed = 1; seed <= UI_SEEDS; seed++) {
        const world = worldOf(seed)
        const run = await runGridDrawer(world, () => null)
        if (!run) continue
        tally.unchanged(world, run.after)
      }
      tally.done(UI_SEEDS / 2)
    },
    UI_TIMEOUT,
  )

  // Before: a Live updates, Interactions or rule edit also tidied the
  // formats.
  it(
    "changes only the section the user edited",
    async () => {
      const tally = tallyOf()
      for (let seed = 1; seed <= UI_SEEDS; seed++) {
        const world = worldOf(seed)
        const r = rngOf(seed * 15485863)
        const run = await runGridDrawer(world, async (drawer) => {
          const rules = world.cell.highlightConfig?.rules.length ?? 0
          const section = r.pick([
            ...(rules > 0 ? ["highlights"] : []),
            "gridMode",
            "formats",
            "interactions",
          ])
          if (section === "formats")
            return editFormats(r, drawer, world.cell.formats)
          if (section === "interactions")
            return editInteractions(drawer, world.cell.interactions)
          if (section === "gridMode") {
            const modes = [
              [undefined, /^Rows as the query returns them/],
              ["stable", /^Keep rows in place/],
              ["stream", /^Flash new rows/],
            ] as const
            const [, label] = r.pick(
              modes.filter(([mode]) => mode !== world.cell.gridMode),
            )
            await pickMenuItem(
              within(drawer).getByRole("button", { name: /^Live updates:/ }),
              label,
            )
            return { section: "gridMode", name: `live mode ${String(label)}` }
          }
          fireEvent.click(
            within(drawer).getByRole("checkbox", { name: "Rule 1 enabled" }),
          )
          return { section: "highlights", name: "toggle rule 1" }
        })
        if (!run?.edit) continue
        const allowed: Field[] =
          run.edit.section === "highlights"
            ? ["highlightConfig"]
            : run.edit.section === "gridMode"
              ? ["gridMode"]
              : run.edit.section === "formats"
                ? ["formats"]
                : ["interactions"]
        tally.only(world, run.after, allowed, run.edit.name, run.edit.column)
      }
      tally.done(UI_SEEDS / 2)
    },
    UI_TIMEOUT,
  )

  // Before: Clear rules also tidied the formats.
  it(
    "clears the rules without changing anything else",
    async () => {
      const tally = tallyOf()
      for (let seed = 1; seed <= UI_SEEDS; seed++) {
        const world = worldOf(seed)
        if ((world.cell.highlightConfig?.rules.length ?? 0) === 0) continue
        const run = await runGridDrawer(world, (drawer) => {
          fireEvent.click(
            within(drawer).getByRole("button", { name: "Clear rules" }),
          )
          return "cleared" as const
        })
        if (!run?.edit) continue
        tally.only(world, run.after, ["highlightConfig"], run.edit.name)
        expect(run.after.highlightConfig?.rules ?? []).toEqual([])
      }
      tally.done(5)
    },
    UI_TIMEOUT,
  )
})
