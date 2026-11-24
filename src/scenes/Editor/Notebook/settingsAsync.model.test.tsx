// @vitest-environment jsdom
import React, { useState, useSyncExternalStore } from "react"
import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import type { HighlightConfig } from "../../../components/ResultGrid/highlight"
import { loadRe2 as loadRealRe2 } from "../../../components/ResultGrid/highlight/pattern"
import { questClient } from "../../../utils/questdb/queryClient"
import type { NotebookVariable } from "../../../store/notebook"
import type { ChartConfig } from "./CellChart/chartTypes"
import { DrawSettingsDrawer } from "./CellChart/DrawSettingsDrawer"
import {
  sameDrawSettings,
  type DrawDraft,
  type DrawSettings,
} from "./CellChart/drawSettings"
import type { QueryTab } from "./DrawCanvas/drawCanvasUtils"
import type { StatementRows } from "./visuals/statementRows"
import {
  HighlightSettingsDrawer,
  type GridSettingsSave,
} from "./CellHighlight/HighlightSettingsDrawer"
import type { HighlightDraft } from "./CellHighlight/ruleDraft"
import type {
  ChartSettingsSession,
  HighlightSettingsSession,
} from "./settingsDrawer/settingsDrawerSessions"
import {
  sameGridSettings,
  type GridSettings,
} from "./result-table/highlightConfig"
import { withNewVariables } from "./interactions/InteractionsEditor"
import { sameVariableName } from "./variableName"
import { createSettingsDrawerSessionStore } from "./settingsDrawer/settingsDrawerSessionStore"
import { useSettingsDrawerSession } from "./settingsDrawer/useSettingsDrawerSession"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "./settingsDrawer/CellOverlayContext"

// Pattern guard for the drawers' async saves (pattern E): a Save, or Clear
// rules, that waits on the database's check of a new variable, or on the
// regex engine, belongs to the drawer session that started it. Random
// sequences of opens, edits in every section, Save and Clear rules, checks
// answering (ok, an error, a failure) in any order, cancels, closes,
// reopens, an agent's write to the saved settings and changes to the live
// notebook variables, checked after every step:
//
//   I1  no save from an ended session;
//   I2  a save writes the draft as it is when it writes;
//   I3  no edit made during a wait is lost;
//   I4  no error or focus move from an ended session shows in a newer one;
//   I5  the busy Save shows exactly while a check of this session waits;
//   I6  new variables are checked against, and merge with, the live ones;
//   I7  a check whose draft (or variables) changed meanwhile is redone with
//       the current draft, not dropped: the same rule in both drawers.

const live = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const state = {
    variables: [] as { name: string; value: string }[],
    set: (variables: { name: string; value: string }[]) => {
      state.variables = variables
      listeners.forEach((l) => l())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return state
})

const re2 = vi.hoisted(() => ({
  ready: false,
  load: (): Promise<boolean> => Promise.resolve(true),
}))

vi.mock("./NotebookProvider", async (importOriginal) => {
  const { useSyncExternalStore } = await import("react")
  return {
    ...(await importOriginal<typeof import("./NotebookProvider")>()),
    useNotebookSettings: () => ({
      variables: useSyncExternalStore(live.subscribe, () => live.variables),
    }),
  }
})

vi.mock("../../../components/ResultGrid/highlight", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../components/ResultGrid/highlight")
  >()),
  isRe2Ready: () => re2.ready,
  loadRe2: () => re2.load(),
}))

vi.mock("@monaco-editor/react", () => ({
  loader: { init: () => new Promise(() => undefined), config: () => undefined },
  Editor: () => null,
}))

beforeAll(async () => {
  // Rule validation compiles patterns with the real engine; the drawer
  // waits on the controlled loader above.
  await loadRealRe2()
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
  }
}

const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

// ------------------------------------------------------------------------
// The model.

type ModelDraft = {
  decimals: number | undefined
  // Horizontal bars (chart), or rule 1 enabled (grid); null without rules.
  flag: boolean | null
  // The variable a click sets, and the new variable the drawer created.
  click: string | null
  created: NotebookVariable | null
}

type Pending = {
  id: number
  kind: "db" | "re2"
  session: number
  revision: number
  // The live variables the check was asked with.
  liveAtCall: string
  settle: (outcome: "ok" | "error" | "reject") => void
}

type Model = {
  session: number
  open: boolean
  // Bumped by every draft edit and live variables change.
  revision: number
  draft: ModelDraft
  command: "save" | "clear" | null
}

type Step = { kind: string; pending?: Pending }

const variablesKey = (variables: NotebookVariable[]) =>
  JSON.stringify(variables.map((v) => [v.name, v.value]))

const harnessOf = (seed: number) => {
  const r = rngOf(seed)
  const model: Model = {
    session: 0,
    open: false,
    revision: 0,
    draft: { decimals: undefined, flag: null, click: null, created: null },
    command: null,
  }
  const pending: Pending[] = []
  const log: string[] = []
  const violations: string[] = []
  let step: Step = { kind: "start" }
  let stepSaves = 0
  let stepCalls = 0
  let ids = 0
  let names = 0
  let values = 0
  const stats = { saves: 0, checks: 0, stale: 0, redone: 0 }

  const violation = (what: string) =>
    violations.push(
      `seed ${seed}: ${what}\n  steps: ${log.slice(-14).join(" → ")}`,
    )

  // Every database check and regex load waits until a step settles it.
  const defer = <T,>(
    kind: Pending["kind"],
    answer: (outcome: "ok" | "error" | "reject", tag: string) => T | Error,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = ++ids
      const session = model.open ? model.session : -1
      stepCalls++
      stats.checks++
      const entry: Pending = {
        id,
        kind,
        session,
        revision: model.revision,
        liveAtCall: variablesKey(live.variables),
        settle: (outcome) => {
          const value = answer(outcome, `s${session}-${id}`)
          if (value instanceof Error) reject(value)
          else resolve(value)
        },
      }
      pending.push(entry)
    })

  type Answer = Awaited<ReturnType<typeof questClient.validateQuery>>
  vi.spyOn(questClient, "validateQuery").mockImplementation(() =>
    defer<Answer>("db", (outcome, tag) => {
      if (outcome === "reject") return new Error(`down-${tag}`)
      if (outcome === "error")
        return { error: `bad-${tag}` } as unknown as Answer
      return {} as Answer
    }),
  )
  re2.ready = false
  re2.load = () =>
    defer<boolean>("re2", () => {
      re2.ready = true
      return true
    })

  return {
    r,
    model,
    pending,
    log,
    violations,
    violation,
    stats,
    get step() {
      return step
    },
    begin(next: Step) {
      step = next
      stepSaves = 0
      stepCalls = 0
      log.push(next.kind)
    },
    get stepSaves() {
      return stepSaves
    },
    get stepCalls() {
      return stepCalls
    },
    countSave() {
      stepSaves++
      stats.saves++
    },
    nextName: () => `nv${++names}`,
    nextValue: () => `'v${++values}'`,
  }
}

type Harness = ReturnType<typeof harnessOf>

// I1, I2 and I6, at the moment a save writes.
const checkSave = (
  h: Harness,
  written: {
    decimals: number | undefined
    flag: boolean | null
    click: string | null
    newVariables: NotebookVariable[]
    cleared?: boolean
  },
) => {
  const { model, step } = h
  h.countSave()
  const fromSession =
    step.kind === "save" ||
    step.kind === "clear" ||
    (step.kind.startsWith("settle") &&
      step.pending?.session === model.session &&
      model.open)
  if (!fromSession)
    h.violation(`I1 a save during "${step.kind}" from an ended session`)
  const { draft } = model
  const expectedNew =
    draft.created && draft.click === draft.created.name ? [draft.created] : []
  const problems: string[] = []
  if (written.decimals !== draft.decimals)
    problems.push(`decimals ${written.decimals} for ${draft.decimals}`)
  if (!written.cleared && written.flag !== draft.flag)
    problems.push(`flag ${written.flag} for ${draft.flag}`)
  if (written.click !== draft.click)
    problems.push(`click ${written.click} for ${draft.click}`)
  if (JSON.stringify(written.newVariables) !== JSON.stringify(expectedNew))
    problems.push(
      `new variables ${JSON.stringify(written.newVariables)} for ${JSON.stringify(expectedNew)}`,
    )
  if (problems.length > 0)
    h.violation(`I2 the save wrote another draft: ${problems.join("; ")}`)
  for (const v of written.newVariables)
    if (live.variables.some((l) => sameVariableName(l.name, v.name)))
      h.violation(`I6 the save adds @${v.name}, which the notebook has`)
  if (
    written.newVariables.length > 0 &&
    step.pending &&
    step.pending.liveAtCall !== variablesKey(live.variables)
  )
    h.violation(
      `I6 the check that approved the save saw other variables: ${step.pending.liveAtCall} for ${variablesKey(live.variables)}`,
    )
  // The owner merges the new variables into the live ones, and the drawer
  // closes.
  live.set(withNewVariables(live.variables, written.newVariables))
  model.open = false
}

// I3, I4, I5, after every step.
const checkAfter = (
  h: Harness,
  title: string,
  lastDraft: ModelDraft | null,
) => {
  const { model, pending } = h
  const drawer = screen.queryByRole("dialog", { name: title })
  if (!model.open) {
    if (drawer) h.violation("the drawer shows after its session ended")
    return
  }
  if (!drawer) {
    h.violation("the drawer closed while its session is open")
    return
  }
  if (lastDraft) {
    const keys = ["decimals", "flag", "click"] as const
    const lost = keys.filter((k) => lastDraft[k] !== model.draft[k])
    if (
      JSON.stringify(lastDraft.created) !== JSON.stringify(model.draft.created)
    )
      lost.push("created" as never)
    if (lost.length > 0)
      h.violation(
        `I3 the draft lost an edit: ${lost.join(", ")} ${JSON.stringify(lastDraft)} for ${JSON.stringify(model.draft)}`,
      )
  }
  const text = drawer.textContent ?? ""
  for (const match of text.matchAll(/(?:bad|down)-s(-?\d+)-(\d+)/g))
    if (Number(match[1]) !== model.session)
      h.violation(
        `I4 session ${model.session} shows ${match[0]}, an error from another session`,
      )
  const busy =
    within(drawer)
      .getByRole("button", { name: "Save" })
      .getAttribute("aria-busy") === "true"
  const waiting = pending.some((p) => p.session === model.session)
  if (busy !== waiting)
    h.violation(
      `I5 Save is ${busy ? "busy" : "not busy"} while ${waiting ? "a check of this session waits" : "no check of this session waits"}`,
    )
}

// ------------------------------------------------------------------------
// The steps both drawers share.

const OPEN_EVENTS = {
  draw: EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS,
  grid: EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS,
} as const

const request = (which: keyof typeof OPEN_EVENTS, mode: "open" | "toggle") =>
  act(() => eventBus.publish(OPEN_EVENTS[which], { cellId: "cell", mode }))

const selectTab = (drawer: HTMLElement, name: string) => {
  const tab = within(drawer).getByRole("tab", { name })
  if (tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab)
}

// An interactions edit: a click into a new variable, a new start for it, or
// a saved click turned off.
const editInteractions = async (h: Harness, drawer: HTMLElement) => {
  const { draft } = h.model
  selectTab(drawer, "Interactions")
  if (draft.click === null) {
    fireEvent.click(
      within(drawer).getByRole("checkbox", { name: /A click sets/ }),
    )
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Variable/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "New variable…" }),
    )
    const name = h.nextName()
    const value = h.nextValue()
    fireEvent.change(within(drawer).getByPlaceholderText("e.g. symbol"), {
      target: { value: name },
    })
    fireEvent.change(within(drawer).getByPlaceholderText(/^e\.g\. '/), {
      target: { value },
    })
    draft.click = name
    draft.created = { name, value }
    return "create a variable"
  }
  if (draft.created) {
    const value = h.nextValue()
    fireEvent.change(within(drawer).getByPlaceholderText(/^e\.g\. '/), {
      target: { value },
    })
    draft.created = { ...draft.created, value }
    return "edit its start"
  }
  fireEvent.click(
    within(drawer).getByRole("checkbox", { name: /A click sets/ }),
  )
  draft.click = null
  return "turn the click off"
}

const editFormats = (h: Harness, drawer: HTMLElement) => {
  selectTab(drawer, "Formats")
  const next = ((h.model.draft.decimals ?? 0) + 1 + h.r.int(8)) % 10
  fireEvent.change(within(drawer).getAllByPlaceholderText("Auto")[0], {
    target: { value: String(next) },
  })
  h.model.draft.decimals = next
  return "edit formats"
}

// A change to the notebook's variables from elsewhere: a value, or a
// variable named like the one the drawer creates.
const changeVariables = (h: Harness) => {
  const { created } = h.model.draft
  const taken =
    created &&
    !live.variables.some((v) => sameVariableName(v.name, created.name)) &&
    h.r.chance(0.3)
  const next = taken
    ? [...live.variables, { name: created.name, value: "'theirs'" }]
    : live.variables.map((v) =>
        v.name === "sym" ? { ...v, value: h.nextValue() } : v,
      )
  act(() => live.set(next))
  h.model.revision++
  return taken ? "variables: the new name taken" : "variables: a value"
}

// Settle a waiting check: I4's focus half, I7.
const settle = async (h: Harness, title: string, hasAlert: () => boolean) => {
  const { model, pending, r } = h
  const entry = r.pick(pending)
  pending.splice(pending.indexOf(entry), 1)
  const outcome =
    entry.kind === "re2"
      ? "ok"
      : r.pick(["ok", "ok", "error", "reject"] as const)
  const current = entry.session === model.session && model.open
  const changed = entry.revision !== model.revision
  if (!current) h.stats.stale++
  h.begin({
    kind: `settle ${entry.kind} ${outcome} (s${entry.session}${current ? "" : " ended"}${changed ? ", draft changed" : ""})`,
    pending: entry,
  })
  const focused = document.activeElement
  await act(async () => {
    entry.settle(outcome)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await tick()
  if (!current && document.activeElement !== focused)
    h.violation("I4 a check from an ended session moved focus")
  if (current && changed && model.open) {
    const redone = h.stepSaves > 0 || h.stepCalls > 0 || hasAlert()
    if (!redone)
      h.violation(
        "I7 a check whose draft changed meanwhile was dropped, not redone",
      )
    else h.stats.redone++
  }
  void title
}

const report = (all: string[], runs: number, stats: Harness["stats"][]) => {
  const total = stats.reduce(
    (sum, s) => ({
      saves: sum.saves + s.saves,
      checks: sum.checks + s.checks,
      stale: sum.stale + s.stale,
      redone: sum.redone + s.redone,
    }),
    { saves: 0, checks: 0, stale: 0, redone: 0 },
  )
  // The first violation of each invariant, in full.
  const firsts = [
    ...new Map<string, string>(
      all
        .map((v): [string, string] => [
          /: (I\d|the drawer)/.exec(v)?.[1] ?? v,
          v,
        ])
        .reverse(),
    ).values(),
  ].reverse()
  expect(
    firsts,
    `${all.length} violations in ${runs} runs (${total.saves} saves, ${total.checks} checks, ${total.stale} stale answers, ${total.redone} redone)`,
  ).toEqual([])
  // The runs reach the interleavings they are for.
  expect(total.saves).toBeGreaterThan(runs)
  expect(total.stale).toBeGreaterThan(runs / 4)
  expect(total.redone).toBeGreaterThan(runs / 6)
}

const SEEDS = 30
const STEPS = 32
const TIMEOUT = 120_000

// ------------------------------------------------------------------------
// The chart settings drawer.

const columns = [
  { name: "ts", type: "TIMESTAMP" },
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
]

const tabs: QueryTab[] = [
  {
    index: 0,
    label: "Q1",
    query: "SELECT ts, symbol, price FROM trades",
    columns,
    xColumn: "ts",
    compatible: true,
    inferredChart: { type: "line", yColumns: ["price"] },
  },
]

const statements: StatementRows[] = [
  { columns, rows: [["2026-01-01T00:00:00.000000Z", "BTC", 1]] },
]

const BARS: ChartConfig = {
  xColumn: "ts",
  queries: [{ type: "bar", yColumns: ["price"] }],
}

const drawWorld = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const state = {
    saved: null as unknown,
    set: (saved: unknown) => {
      state.saved = saved
      listeners.forEach((l) => l())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return state
})

const DrawOwner = ({
  onSave,
  onDraft,
}: {
  onSave: (next: DrawSettings, newVariables: NotebookVariable[]) => void
  onDraft: (draft: DrawDraft) => void
}) => {
  const saved = useSyncExternalStore(
    drawWorld.subscribe,
    () => drawWorld.saved as DrawSettings,
  )
  const [sessions] = useState(() =>
    createSettingsDrawerSessionStore<ChartSettingsSession>(),
  )
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const drawer = useSettingsDrawerSession<DrawSettings, DrawDraft>({
    sessions,
    cellId: "cell",
    config: saved,
    sameConfig: sameDrawSettings,
    openEvent: OPEN_EVENTS.draw,
    onOpen: () => undefined,
    onCancel: () => undefined,
    changedWhileOpenMessage: "Chart settings were updated by the assistant.",
  })
  return (
    <>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <DrawSettingsDrawer
          open={drawer.open}
          onClose={drawer.close}
          initialDraft={drawer.initialDraft}
          onDraftChange={(draft) => {
            onDraft(draft)
            drawer.keepDraft(draft)
          }}
          appearInPlace={drawer.appearInPlace}
          tabs={tabs}
          saved={saved}
          effective={saved.chartConfig}
          statements={statements}
          onSave={onSave}
        />
      </CellOverlayProvider>
    </>
  )
}

const drawDraftOf = (draft: DrawDraft): ModelDraft => ({
  decimals: draft.formats?.price?.decimals,
  flag: draft.chart.horizontal === true,
  click: draft.interactions?.click?.variable ?? null,
  created: draft.created.click ?? null,
})

const runDraw = async (seed: number) => {
  const h = harnessOf(seed)
  const { r, model } = h
  live.set([{ name: "sym", value: "'BTC'" }])
  drawWorld.set({ chartConfig: BARS, formats: { price: { decimals: 1 } } })
  let lastDraft: ModelDraft | null = null
  const view = renderComponent(
    <DrawOwner
      onSave={(next, newVariables) => {
        checkSave(h, {
          decimals: next.formats?.price?.decimals,
          flag: next.chartConfig.horizontal === true,
          click: next.interactions?.click?.variable ?? null,
          newVariables,
        })
        drawWorld.set(next)
      }}
      onDraft={(draft) => {
        lastDraft = drawDraftOf(draft)
      }}
    />,
  )
  const title = "Chart settings"
  const drawer = () => screen.getByRole("dialog", { name: title })
  const hasAlert = () =>
    model.open && within(drawer()).queryAllByRole("alert").length > 0
  const open = async () => {
    lastDraft = null
    request("draw", "open")
    await tick()
    const saved = drawWorld.saved as DrawSettings
    model.session++
    model.open = true
    model.command = null
    model.draft = {
      decimals: saved.formats?.price?.decimals,
      flag: saved.chartConfig.horizontal === true,
      click: saved.interactions?.click?.variable ?? null,
      created: null,
    }
  }
  try {
    for (let i = 0; i < STEPS; i++) {
      const roll = r.next()
      if (!model.open) {
        if (h.pending.length > 0 && roll < 0.35) {
          await settle(h, title, hasAlert)
        } else if (roll < 0.45) {
          h.begin({ kind: changeVariables(h) })
        } else {
          h.begin({ kind: "open" })
          await open()
        }
      } else if (h.pending.length > 0 && roll < 0.3) {
        await settle(h, title, hasAlert)
      } else if (roll < 0.52) {
        const section = r.pick([
          "interactions",
          "interactions",
          "formats",
          "chart",
        ])
        h.begin({ kind: `edit ${section}` })
        if (section === "interactions") await editInteractions(h, drawer())
        else if (section === "formats") editFormats(h, drawer())
        else {
          selectTab(drawer(), "Chart")
          fireEvent.click(
            within(drawer()).getByRole("checkbox", { name: /Horizontal bars/ }),
          )
          model.draft.flag = !model.draft.flag
        }
        model.revision++
        await tick()
      } else if (roll < 0.68) {
        h.begin({ kind: "save" })
        fireEvent.click(within(drawer()).getByRole("button", { name: "Save" }))
        await tick()
      } else if (roll < 0.8) {
        h.begin({ kind: changeVariables(h) })
        await tick()
      } else if (roll < 0.87) {
        h.begin({ kind: "cancel" })
        fireEvent.click(
          within(drawer()).getByRole("button", { name: "Cancel" }),
        )
        model.open = false
        await tick()
      } else if (roll < 0.9) {
        h.begin({ kind: "close (toggle)" })
        request("draw", "toggle")
        model.open = false
        await tick()
      } else if (roll < 0.95) {
        h.begin({ kind: "reopen" })
        fireEvent.click(
          within(drawer()).getByRole("button", { name: "Cancel" }),
        )
        model.open = false
        await tick()
        await open()
      } else {
        h.begin({ kind: "agent write" })
        const saved = drawWorld.saved as DrawSettings
        act(() =>
          drawWorld.set(
            r.chance(0.5)
              ? { ...saved, formats: { price: { decimals: 1 + r.int(5) } } }
              : {
                  ...saved,
                  chartConfig: {
                    ...saved.chartConfig,
                    horizontal: !saved.chartConfig.horizontal,
                  },
                },
          ),
        )
        model.open = false
        await tick()
      }
      if (!model.open) lastDraft = null
      checkAfter(h, title, lastDraft)
      if (h.violations.length > 0) break
    }
  } finally {
    view.unmount()
  }
  return h
}

describe("an async chart settings save", () => {
  // Failed before useDraftSession (I6): the check, and a check redone after
  // an edit, used the variables of the render that saved, so a name the
  // notebook took meanwhile passed. Seed 13: create a variable → Save → the
  // notebook takes its name → the check passes → the save adds @nv1, which
  // the notebook has.
  it(
    "belongs to the session and the draft that started it",
    async () => {
      const all: string[] = []
      const stats: Harness["stats"][] = []
      for (let seed = 1; seed <= SEEDS; seed++) {
        const h = await runDraw(seed)
        all.push(...h.violations)
        stats.push(h.stats)
      }
      report(all, SEEDS, stats)
    },
    TIMEOUT,
  )
})

// ------------------------------------------------------------------------
// The grid settings drawer: Save, which may wait on the regex engine too,
// and Clear rules.

const RULES: HighlightConfig = {
  identityColumns: ["k"],
  rules: [
    {
      id: "change",
      kind: "previous",
      enabled: true,
      target: { kind: "column", name: "v" },
      condition: { op: "changedBy", threshold: 0, unit: "percent" },
      appliesTo: "cell",
      display: "temporary",
      color: "dataSeries2",
    },
    {
      id: "pattern",
      kind: "value",
      enabled: true,
      target: { kind: "column", name: "k" },
      condition: { op: "matches", pattern: "^B" },
      appliesTo: "cell",
      display: "always",
      color: "dataSeries3",
    },
  ],
}

const GRID_COLUMNS = [
  { name: "k", type: "STRING" },
  { name: "v", type: "LONG" },
]

const DEFAULT_GRID: HighlightConfig = { identityColumns: ["k"], rules: [] }

const GridOwner = ({
  onSave,
  onDraft,
}: {
  onSave: (save: GridSettingsSave) => void
  onDraft: (draft: HighlightDraft) => void
}) => {
  const saved = useSyncExternalStore(
    drawWorld.subscribe,
    () => drawWorld.saved as GridSettings,
  )
  const variables = useSyncExternalStore(live.subscribe, () => live.variables)
  const [sessions] = useState(() =>
    createSettingsDrawerSessionStore<HighlightSettingsSession>(),
  )
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const drawer = useSettingsDrawerSession<GridSettings, HighlightDraft>({
    sessions,
    cellId: "cell",
    config: saved,
    sameConfig: sameGridSettings,
    openEvent: OPEN_EVENTS.grid,
    onOpen: () => undefined,
    onCancel: () => undefined,
    changedWhileOpenMessage: "Grid settings were updated since last check.",
  })
  return (
    <>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          key={drawer.generation}
          open={drawer.open}
          appearInPlace={drawer.appearInPlace}
          initialDraft={drawer.initialDraft}
          onDraftChange={(draft) => {
            onDraft(draft)
            drawer.keepDraft(draft)
          }}
          columns={GRID_COLUMNS}
          columnRange={() => null}
          config={saved.highlightConfig ?? DEFAULT_GRID}
          savedConfig={saved.highlightConfig}
          formats={saved.formats}
          gridMode={saved.gridMode}
          interactions={saved.interactions}
          variables={variables}
          samples={{ v: 12 }}
          defaultIdentity={["k"]}
          duplicateCountOf={() => 0}
          onSave={(save) => {
            onSave(save)
            drawer.close()
          }}
          onCancel={drawer.cancel}
        />
      </CellOverlayProvider>
    </>
  )
}

const ruleFlagOf = (config: HighlightConfig | undefined) => {
  const rule = config?.rules.find((r) => r.id === "change")
  return rule ? rule.enabled : null
}

const gridDraftOf = (draft: HighlightDraft): ModelDraft => ({
  decimals: draft.formats?.v?.decimals,
  flag: ruleFlagOf(draft.config as HighlightConfig),
  click: draft.interactions?.click?.variable ?? null,
  created: draft.created?.click ?? null,
})

const runGrid = async (seed: number) => {
  const h = harnessOf(seed)
  const { r, model } = h
  live.set([{ name: "sym", value: "'BTC'" }])
  drawWorld.set({ highlightConfig: RULES, formats: { v: { decimals: 1 } } })
  let lastDraft: ModelDraft | null = null
  const view = renderComponent(
    <GridOwner
      onSave={(save) => {
        checkSave(h, {
          decimals: save.formats?.v?.decimals,
          flag: ruleFlagOf(save.highlight ?? undefined),
          click: save.interactions?.click?.variable ?? null,
          newVariables: save.newVariables,
          cleared: h.model.command === "clear",
        })
        if (h.model.command === "clear" && (save.highlight?.rules.length ?? 0))
          h.violation("I2 Clear rules wrote rules")
        if (h.model.command === "save" && h.model.draft.flag !== null) {
          // Save keeps both rules.
          if (save.highlight?.rules.length !== 2)
            h.violation("I2 Save lost a rule")
        }
        const current = drawWorld.saved as GridSettings
        drawWorld.set({
          ...current,
          highlightConfig: save.highlight ?? undefined,
          formats: save.formats,
          gridMode: save.gridMode,
          interactions: save.interactions,
        })
      }}
      onDraft={(draft) => {
        lastDraft = gridDraftOf(draft)
      }}
    />,
  )
  const title = "Grid settings"
  const drawer = () => screen.getByRole("dialog", { name: title })
  const hasAlert = () =>
    model.open && within(drawer()).queryAllByRole("alert").length > 0
  const open = async () => {
    // The engine sometimes still loads when a session saves.
    if (r.chance(0.5)) re2.ready = false
    lastDraft = null
    request("grid", "open")
    await tick()
    const saved = drawWorld.saved as GridSettings
    model.session++
    model.open = true
    model.command = null
    model.draft = {
      decimals: saved.formats?.v?.decimals,
      flag: ruleFlagOf(saved.highlightConfig),
      click: saved.interactions?.click?.variable ?? null,
      created: null,
    }
  }
  const busy = () =>
    h.pending.some((p) => p.session === model.session && model.open)
  try {
    for (let i = 0; i < STEPS; i++) {
      const roll = r.next()
      if (!model.open) {
        if (h.pending.length > 0 && roll < 0.35) {
          await settle(h, title, hasAlert)
        } else if (roll < 0.45) {
          h.begin({ kind: changeVariables(h) })
        } else {
          h.begin({ kind: "open" })
          await open()
        }
      } else if (h.pending.length > 0 && roll < 0.3) {
        await settle(h, title, hasAlert)
      } else if (roll < 0.5) {
        const section = r.pick([
          "interactions",
          "interactions",
          "formats",
          ...(model.draft.flag !== null ? ["rules"] : []),
        ])
        h.begin({ kind: `edit ${section}` })
        if (section === "interactions") await editInteractions(h, drawer())
        else if (section === "formats") editFormats(h, drawer())
        else {
          selectTab(drawer(), "Highlights")
          fireEvent.click(
            within(drawer()).getByRole("checkbox", { name: "Rule 1 enabled" }),
          )
          model.draft.flag = !model.draft.flag
        }
        model.revision++
        await tick()
      } else if (roll < 0.68) {
        const clear = model.draft.flag !== null && r.chance(0.4)
        h.begin({ kind: clear ? "clear" : "save" })
        if (!busy()) model.command = clear ? "clear" : "save"
        if (clear) {
          selectTab(drawer(), "Highlights")
          fireEvent.click(
            within(drawer()).getByRole("button", { name: "Clear rules" }),
          )
        } else
          fireEvent.click(
            within(drawer()).getByRole("button", { name: "Save" }),
          )
        await tick()
      } else if (roll < 0.8) {
        h.begin({ kind: changeVariables(h) })
        await tick()
      } else if (roll < 0.87) {
        h.begin({ kind: "cancel" })
        fireEvent.click(
          within(drawer()).getByRole("button", { name: "Cancel" }),
        )
        model.open = false
        await tick()
      } else if (roll < 0.9) {
        h.begin({ kind: "close (toggle)" })
        request("grid", "toggle")
        model.open = false
        await tick()
      } else if (roll < 0.95) {
        h.begin({ kind: "reopen" })
        fireEvent.click(
          within(drawer()).getByRole("button", { name: "Cancel" }),
        )
        model.open = false
        await tick()
        await open()
      } else {
        h.begin({ kind: "agent write" })
        const saved = drawWorld.saved as GridSettings
        act(() =>
          drawWorld.set(
            r.chance(0.5)
              ? { ...saved, formats: { v: { decimals: 1 + r.int(5) } } }
              : { ...saved, highlightConfig: { ...RULES } },
          ),
        )
        model.open = false
        await tick()
      }
      if (!model.open) lastDraft = null
      checkAfter(h, title, lastDraft)
      if (h.violations.length > 0) break
    }
  } finally {
    view.unmount()
  }
  return h
}

describe("an async grid settings save or Clear rules", () => {
  // Failed before useDraftSession. I6: a check answered after the
  // notebook's variables changed saved anyway (seed 7: Save → a variable's
  // value changes → the check passes → the save goes on with a check of the
  // old variables). I7: an interactions edit during the check dropped the
  // Save or Clear rules instead of redoing it, unlike the chart drawer
  // (seed 8: create a variable → Save → edit its start → the check fails →
  // nothing saved, nothing checked again, no message).
  it(
    "belongs to the session and the draft that started it",
    async () => {
      const all: string[] = []
      const stats: Harness["stats"][] = []
      for (let seed = 1; seed <= SEEDS; seed++) {
        const h = await runGrid(seed)
        all.push(...h.violations)
        stats.push(h.stats)
      }
      report(all, SEEDS, stats)
    },
    TIMEOUT,
  )
})
