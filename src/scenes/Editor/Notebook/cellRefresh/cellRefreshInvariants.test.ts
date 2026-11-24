// @vitest-environment jsdom
// Model-based check of the variable refresh engine. A seeded generator plays
// random sequences of user events over a small notebook against the real
// engine, the real hydration engine and the real foreground run hook, with a
// fake database whose requests settle only when an event says so. The glue
// the notebook provider puts between them is mirrored by `Mount`. After the
// system is quiescent, and at every request, an oracle checks the invariants
// below.
//
// Locally: REFRESH_INVARIANT_SEEDS=500 runs more seeds;
// REFRESH_INVARIANT_REPORT=1 prints the violations per invariant, with
// REFRESH_INVARIANT_MINIMIZE=<n> the minimized sequences of n seeds each, and
// REFRESH_INVARIANT_TRACE=1 their request traces;
// REFRESH_INVARIANT_SCENARIO='<json>' traces one scenario.
//
// 1. Liveness: a visible slot that shows rows read with other values than the
//    current ones, that the user did not stop at those values, and whose cell
//    still has the SQL of its last whole run, gets current rows.
// 2. No needless work: the engine never re-reads a slot that already shows
//    rows for the current values, and never reads one target twice.
// 3. Stop holds: a slot the user stopped is not read again for the same
//    values without an explicit Run or refresh.
// 4. No untouched SQL: the engine only re-reads statements the user ran.
// 5. One fetch at a time: a foreground run and an engine read never overlap
//    on one cell; two engine reads never overlap on one slot.
// 6. Persisted = shown: a saved snapshot carries the bindings of its rows,
//    and the rows on screen are the ones on disk.
//
// Documented exceptions, not violations: a hidden cell refreshes when it is
// revealed; Apply in the Variables popover re-runs nothing; a cell whose
// last run covered only some of its statements is not refreshed; cells with
// auto-refresh are exempt from 2 and 3 (their ticks re-read on purpose).
import { renderHook } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type {
  AutoRefresh,
  CellResult,
  NotebookCell,
  NotebookVariable,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import {
  deleteCellSnapshot,
  updateCellSnapshotActiveIndex,
  type NotebookResultSnapshot,
} from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import { CellRefreshEngine, type CellRefreshDeps } from "./cellRefreshEngine"
import { CellResultHydrationEngine } from "../resultHydration/cellResultHydration"
import { useCellExecution } from "../useCellExecution"
import {
  affectedVariables,
  expandGlobals,
  hasChangedBindings,
  usesVariables,
} from "../declareUtils"
import { normalizeQueryText } from "../../Monaco/utils"
import { statementKeysFor } from "../statementIdentity"
import { createRequestLimiter } from "../../../../utils/questdb/requestLimiter"
import { clearStatementClassCache } from "../../../../utils/tools/permissions"
import { releaseCellResultPatch } from "../cellSizing"

vi.mock("../persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn(),
}))

vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: vi.fn(),
  updateCellSnapshotActiveIndex: vi.fn(),
}))

const BUFFER_ID = 7

// ---------------------------------------------------------------- notebook

type Expr = "@a" | "@b" | "@d" | "1" | "self"
type Stmt = { sid: string; expr: Expr }
type VarName = "a" | "b"

// `d` is derived from `a`; `self` declares its own `a` and reads no global.
const INITIAL_VARS: NotebookVariable[] = [
  { name: "a", value: "'x'" },
  { name: "b", value: "'p'" },
  { name: "d", value: "@a" },
]
const STALE_VARS: NotebookVariable[] = [
  { name: "a", value: "'y'" },
  { name: "b", value: "'q'" },
  { name: "d", value: "@a" },
]
const DOMAIN: Record<VarName, string[]> = {
  a: ["'x'", "'y'", "'z'"],
  b: ["'p'", "'q'"],
}
// 'y' and 'z' read equal rows: a refresh can return the rows already shown
// under another binding.
const ROWS: Record<string, string> = {
  "'x'": "X",
  "'y'": "YZ",
  "'z'": "YZ",
  "'p'": "P",
  "'q'": "Q",
}

const stmtText = ({ sid, expr }: Stmt) =>
  expr === "self"
    ? `declare @a := 'w' select @a as ${sid}`
    : `select ${expr} as ${sid}`

const valueOf = (vars: NotebookVariable[], name: string) =>
  vars.find((v) => v.name === name)?.value ?? "?"

// What a statement reads: the target a refresh must reach.
const targetOf = (expr: Expr, vars: NotebookVariable[]): string =>
  expr === "@a" || expr === "@d"
    ? `a=${valueOf(vars, "a")}`
    : expr === "@b"
      ? `b=${valueOf(vars, "b")}`
      : "-"

const rowsOf = (target: string) =>
  target === "-" ? [["K"]] : [[ROWS[target.slice(2)] ?? "?"]]

const sidOf = (sql: string): string | undefined =>
  /\bas (s\d+)\s*;?\s*$/.exec(sql.trim())?.[1]

const norm = normalizeQueryText

// ------------------------------------------------------------------ events

type CellSpec = {
  kind: "grid" | "chart"
  exprs: Expr[]
  autoRefresh: AutoRefresh
  visible: boolean
  snapshot: "current" | "stale" | "none"
}

type HarnessEvent =
  // A chart click that sets a variable (the same or a new value).
  | { t: "click"; v: VarName; value: string }
  // Apply in the Variables popover.
  | { t: "apply"; v: VarName; value: string }
  // A foreground Run: the whole cell, a selection of one statement, or one
  // statement's rerun from its tab; `agent` runs carry a Chat signal.
  | {
      t: "run"
      cell: number
      scope: "whole" | "selection" | "one"
      pick: number
      agent?: boolean
    }
  // Stop one running statement (engine read or foreground run).
  | { t: "stopSlot"; cell: number; pick: number }
  // Stop a cell's foreground run, or a chart's fetch.
  | { t: "stopCell"; cell: number }
  // Stop in the Chat panel, ending the agent's run.
  | { t: "chatStop" }
  // A database request settles.
  | { t: "complete"; pick: number; ok: boolean }
  // An SQL edit: change a statement, append one, or add whitespace.
  | {
      t: "edit"
      cell: number
      kind: "modify" | "append" | "space"
      pick: number
      expr: Expr
    }
  | { t: "hide"; cell: number }
  | { t: "show"; cell: number }
  | { t: "tick" }
  | { t: "reload" }
  | { t: "wait"; ms: number }
  | { t: "settle" }

type Scenario = { cells: CellSpec[]; events: HarnessEvent[] }

type Violation = { invariant: number; event: number; message: string }

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const generateScenario = (seed: number): Scenario => {
  const rnd = mulberry32(seed)
  const int = (n: number) => Math.floor(rnd() * n)
  const pickOf = <T>(items: T[]): T => items[int(items.length)]
  const exprs: Expr[] = ["@a", "@a", "@b", "@d", "1", "self"]
  const cellCount = 2 + int(3)
  const cells: CellSpec[] = Array.from({ length: cellCount }, (_, i) => {
    const kind = rnd() < 0.2 ? "chart" : "grid"
    return {
      kind,
      exprs: Array.from({ length: 1 + int(3) }, () => pickOf(exprs)),
      autoRefresh: i === 0 && rnd() < 0.15 ? "1m" : false,
      visible: rnd() < 0.75,
      snapshot:
        kind === "chart"
          ? rnd() < 0.5
            ? "current"
            : "none"
          : rnd() < 0.2
            ? "stale"
            : "current",
    }
  })
  const table: Array<[number, () => HarnessEvent]> = [
    [
      20,
      () => {
        const v = pickOf<VarName>(["a", "a", "b"])
        return { t: "click", v, value: pickOf(DOMAIN[v]) }
      },
    ],
    [
      4,
      () => {
        const v = pickOf<VarName>(["a", "b"])
        return { t: "apply", v, value: pickOf(DOMAIN[v]) }
      },
    ],
    [
      12,
      () => ({
        t: "run",
        cell: int(cellCount),
        scope: pickOf<"whole" | "selection" | "one">([
          "whole",
          "whole",
          "selection",
          "one",
        ]),
        pick: int(6),
        ...(rnd() < 0.25 ? { agent: true } : {}),
      }),
    ],
    [8, () => ({ t: "stopSlot", cell: int(cellCount), pick: int(6) })],
    [4, () => ({ t: "stopCell", cell: int(cellCount) })],
    [2, () => ({ t: "chatStop" })],
    [16, () => ({ t: "complete", pick: int(6), ok: rnd() < 0.85 })],
    [
      5,
      () => ({
        t: "edit",
        cell: int(cellCount),
        kind: pickOf<"modify" | "append" | "space">([
          "modify",
          "append",
          "space",
        ]),
        pick: int(6),
        expr: pickOf(exprs),
      }),
    ],
    [5, () => ({ t: "hide", cell: int(cellCount) })],
    [6, () => ({ t: "show", cell: int(cellCount) })],
    [2, () => ({ t: "tick" })],
    [2, () => ({ t: "reload" })],
    [8, () => ({ t: "wait", ms: pickOf([20, 60, 150, 350]) })],
    [5, () => ({ t: "settle" })],
  ]
  const total = table.reduce((sum, [weight]) => sum + weight, 0)
  const events = Array.from({ length: 6 + int(18) }, () => {
    let roll = rnd() * total
    for (const [weight, make] of table) {
      roll -= weight
      if (roll < 0) return make()
    }
    return table[0][1]()
  })
  return { cells, events }
}

// ---------------------------------------------------------------- database

type Request = {
  id: number
  origin: "engine" | "foreground"
  cellId: string
  sid: string
  target: string
  status: "pending" | "ok" | "failed" | "aborted"
  settle: (ok: boolean) => void
}

// ------------------------------------------------------------------ oracle

type SlotRecord = {
  target: string
  epoch: number
  // `${target}@${epoch}` marks: the user stopped, Apply held, or a read
  // failed at that target.
  stopped?: string
  exempt?: string
  failed?: string
  explicit: number
}

// ------------------------------------------------------------------- world

class World {
  cells: NotebookCell[] = []
  cellsRef = { current: [] as NotebookCell[] }
  stmts = new Map<string, Stmt[]>()
  kinds = new Map<string, "grid" | "chart">()
  vars: NotebookVariable[] = INITIAL_VARS
  disk = new Map<string, NotebookResultSnapshot>()
  visible = new Set<string>()
  pollCells = new Set<string>()
  violations: Violation[] = []
  requests: Request[] = []
  effectiveTargets = new Map<string, string>()
  slots = new Map<string, SlotRecord>()
  completed = new Map<string, number>()
  ran = new Map<string, Set<string>>()
  lastFullRun = new Map<string, string[] | null>()
  eventIndex = -1
  nextSid = 0
  nextRequest = 0
  mount!: Mount

  constructor(spec: CellSpec[]) {
    spec.forEach((cellSpec, index) => {
      const id = `c${index}`
      const stmts = cellSpec.exprs.map((expr) => this.newStmt(expr))
      this.stmts.set(id, stmts)
      this.kinds.set(id, cellSpec.kind)
      if (cellSpec.autoRefresh !== false) this.pollCells.add(id)
      if (cellSpec.visible) this.visible.add(id)
      const value = stmts.map(stmtText).join(";\n")
      const hasSnapshot = cellSpec.snapshot !== "none"
      this.cells.push({
        id,
        position: index,
        value,
        autoRefresh: cellSpec.autoRefresh,
        ...(cellSpec.kind === "chart"
          ? { mode: "draw" as const }
          : { lastRunStatus: "success" as const }),
      })
      if (cellSpec.kind === "grid") {
        this.ran.set(id, new Set(stmts.map((s) => norm(stmtText(s)))))
        this.lastFullRun.set(
          id,
          stmts.map((s) => norm(stmtText(s))),
        )
      }
      if (hasSnapshot) {
        const vars = cellSpec.snapshot === "stale" ? STALE_VARS : INITIAL_VARS
        this.disk.set(id, {
          bufferId: BUFFER_ID,
          cellId: id,
          savedAt: Date.now(),
          results: stmts.map((stmt) => this.rowsResult(stmt, vars)),
        })
      }
    })
    this.cellsRef.current = this.cells
    this.updateTargets()
  }

  newStmt(expr: Expr): Stmt {
    const stmt = { sid: `s${this.nextSid++}`, expr }
    return stmt
  }

  rowsResult(stmt: Stmt, vars: NotebookVariable[]): SingleQueryResult {
    const sql = stmtText(stmt)
    const target = targetOf(stmt.expr, vars)
    const effectiveQuery = expandGlobals(sql, vars)
    this.effectiveTargets.set(effectiveQuery, target)
    return {
      type: "dql",
      query: sql,
      effectiveQuery,
      columns: [{ name: stmt.sid, type: "STRING" }],
      dataset: rowsOf(target),
      count: 1,
      fetchedAt: Date.now(),
    }
  }

  cell(cellId: string) {
    return this.cellsRef.current.find((c) => c.id === cellId)
  }

  cellIdAt(index: number): string | undefined {
    return this.cells[index]?.id
  }

  stmtOfSid(sid: string): { cellId: string; stmt: Stmt } | undefined {
    for (const [cellId, stmts] of this.stmts) {
      const stmt = stmts.find((s) => s.sid === sid)
      if (stmt) return { cellId, stmt }
    }
    return this.retired.get(sid)
  }

  retired = new Map<string, { cellId: string; stmt: Stmt }>()

  setCells(next: NotebookCell[]) {
    this.cells = next
    this.cellsRef.current = next
    this.mount?.scheduleRender()
  }

  trace: string[] = []

  violate(invariant: number, message: string) {
    this.violations.push({ invariant, event: this.eventIndex, message })
    this.trace.push(`  !! ${invariant}: ${message}`)
  }

  slot(sid: string): SlotRecord {
    let record = this.slots.get(sid)
    if (!record) {
      const found = this.stmtOfSid(sid)
      record = {
        target: found ? targetOf(found.stmt.expr, this.vars) : "?",
        epoch: 0,
        explicit: 0,
      }
      this.slots.set(sid, record)
    }
    return record
  }

  mark(sid: string, target = this.slot(sid).target) {
    return `${target}@${this.slot(sid).epoch}`
  }

  // Returns the slots whose target moved.
  updateTargets(): string[] {
    const moved: string[] = []
    for (const stmts of this.stmts.values()) {
      for (const stmt of stmts) {
        const record = this.slot(stmt.sid)
        const target = targetOf(stmt.expr, this.vars)
        if (record.target === target) continue
        record.target = target
        record.epoch++
        moved.push(stmt.sid)
      }
    }
    return moved
  }

  explicitRefresh(sids: string[]) {
    for (const sid of sids) {
      const record = this.slot(sid)
      record.explicit++
      record.stopped = undefined
      record.exempt = undefined
      record.failed = undefined
    }
  }

  observed(cell: NotebookCell, stmt: Stmt): string | undefined {
    const result = cell.result?.results.find(
      (r) => norm(r.query) === norm(stmtText(stmt)),
    )
    if (result?.type !== "dql" || result.effectiveQuery === undefined)
      return undefined
    return this.effectiveTargets.get(result.effectiveQuery) ?? "?"
  }

  // --- database

  exec(
    origin: Request["origin"],
    sql: string,
    globals: NotebookVariable[],
    signal?: AbortSignal,
  ): Promise<QueryExecResult> {
    const aborted = (): QueryExecResult => ({
      type: "error",
      query: sql,
      columns: [],
      dataset: [],
      count: 0,
      error: "Cancelled by user",
    })
    if (signal?.aborted) return Promise.resolve(aborted())
    const sid = sidOf(sql)
    const found = sid ? this.stmtOfSid(sid) : undefined
    if (!sid || !found) {
      this.violate(5, `unknown statement executed: ${sql}`)
      return Promise.resolve(aborted())
    }
    const target = targetOf(found.stmt.expr, globals)
    const effectiveQuery = expandGlobals(sql, globals)
    this.effectiveTargets.set(effectiveQuery, target)
    return new Promise((resolve) => {
      const request: Request = {
        id: this.nextRequest++,
        origin,
        cellId: found.cellId,
        sid,
        target,
        status: "pending",
        settle: (ok) => {
          if (request.status !== "pending") return
          request.status = ok ? "ok" : "failed"
          this.trace.push(`  r${request.id} ${request.status}`)
          this.onFetchEnd(request)
          resolve(
            ok
              ? {
                  type: "dql",
                  query: sql,
                  effectiveQuery,
                  columns: [{ name: sid, type: "STRING" }],
                  dataset: rowsOf(target),
                  count: 1,
                }
              : {
                  type: "error",
                  query: sql,
                  columns: [],
                  dataset: [],
                  count: 0,
                  error: "boom",
                },
          )
        },
      }
      this.trace.push(
        `  ${origin} r${request.id} ${sid}@${found.cellId} ${target}`,
      )
      this.onFetchStart(request)
      this.requests.push(request)
      signal?.addEventListener(
        "abort",
        () => {
          if (request.status !== "pending") return
          request.status = "aborted"
          this.trace.push(`  r${request.id} aborted`)
          resolve(aborted())
        },
        { once: true },
      )
    })
  }

  pending(): Request[] {
    return this.requests.filter((r) => r.status === "pending")
  }

  persist(snapshot: NotebookResultSnapshot): Promise<boolean> {
    for (const result of snapshot.results) {
      if (result.type !== "dql" || result.effectiveQuery === undefined) continue
      const target = this.effectiveTargets.get(result.effectiveQuery)
      if (
        target === undefined ||
        JSON.stringify(result.dataset) !== JSON.stringify(rowsOf(target))
      )
        this.violate(
          6,
          `${snapshot.cellId} saved ${JSON.stringify(result.dataset)} as read with ${target}`,
        )
    }
    this.disk.set(snapshot.cellId, snapshot)
    return Promise.resolve(true)
  }

  // --- invariants checked as requests start and end

  onFetchStart(request: Request) {
    const { cellId, sid, target } = request
    const others = this.pending().filter((r) => r.cellId === cellId)
    if (request.origin === "foreground") {
      if (others.some((r) => r.origin === "engine"))
        this.violate(5, `${cellId}: foreground run overlaps an engine read`)
      return
    }
    if (others.some((r) => r.origin === "foreground"))
      this.violate(5, `${cellId}: engine read overlaps a foreground run`)
    else if (this.mount.runPending(cellId))
      this.violate(5, `${cellId}: engine read during a foreground run`)
    if (others.some((r) => r.origin === "engine" && r.sid === sid))
      this.violate(5, `${sid}: two engine reads at once`)
    if (this.pollCells.has(cellId)) return
    const record = this.slot(sid)
    if (
      this.kinds.get(cellId) === "grid" &&
      !this.ran.get(cellId)?.has(norm(stmtText(this.stmtOfSid(sid)!.stmt)))
    )
      this.violate(4, `${sid}: the engine ran a statement the user never ran`)
    if (target !== record.target) return
    const cell = this.cell(cellId)
    const shown = cell && this.observed(cell, this.stmtOfSid(sid)!.stmt)
    if (shown === target)
      this.violate(2, `${sid}: re-read ${target}, which it already shows`)
    const key = `${sid}|${this.mark(sid)}|${record.explicit}`
    if ((this.completed.get(key) ?? 0) > 0)
      this.violate(2, `${sid}: read ${target} a second time`)
    if (record.stopped === this.mark(sid))
      this.violate(3, `${sid}: read ${target} again after the user stopped it`)
  }

  onFetchEnd(request: Request) {
    const record = this.slot(request.sid)
    if (request.target !== record.target) return
    if (request.status === "failed") record.failed = this.mark(request.sid)
    if (request.origin !== "engine") return
    const key = `${request.sid}|${this.mark(request.sid)}|${record.explicit}`
    this.completed.set(key, (this.completed.get(key) ?? 0) + 1)
  }

  // --- invariants checked when the system is quiescent

  checkQuiescent() {
    for (const cell of this.cells) {
      if (!this.visible.has(cell.id) || !cell.result) continue
      const stmts = this.stmts.get(cell.id) ?? []
      if (this.kinds.get(cell.id) === "grid") {
        const full = this.lastFullRun.get(cell.id)
        if (
          !full ||
          full.join("\u0001") !==
            stmts.map((s) => norm(stmtText(s))).join("\u0001")
        )
          continue
      }
      for (const stmt of stmts) {
        const shown = this.observed(cell, stmt)
        if (shown === undefined) continue
        const record = this.slot(stmt.sid)
        if (shown === record.target) continue
        const mark = this.mark(stmt.sid)
        if (
          record.stopped === mark ||
          record.exempt === mark ||
          record.failed === mark
        )
          continue
        this.violate(
          1,
          `${stmt.sid} in ${cell.id} shows ${shown}, values are ${record.target}`,
        )
      }
    }
    for (const cell of this.cells) {
      const disk = this.disk.get(cell.id)
      if (!cell.result || !disk || this.pollCells.has(cell.id)) continue
      for (const shown of cell.result.results) {
        if (shown.type !== "dql") continue
        const saved = disk.results.find(
          (r) => norm(r.query) === norm(shown.query),
        )
        if (!saved) continue
        if (
          saved.type !== "dql" ||
          saved.effectiveQuery !== shown.effectiveQuery
        )
          this.violate(
            6,
            `${cell.id}: ${sidOf(shown.query)} on screen differs from disk`,
          )
      }
    }
  }
}

// ------------------------------------------------------------------- mount

// One mounted notebook: the engines and the provider glue between them,
// mirroring NotebookProvider. A reload replaces it.
class Mount {
  engine: CellRefreshEngine
  hydration: CellResultHydrationEngine
  exec: ReturnType<typeof useCellExecution>
  unmountHook: () => void
  renderedVars: NotebookVariable[]
  pendingVariableRefresh: string[] = []
  activeKeys = new Map<string, number>()
  running = new Set<string>()
  agent: { cellId: string; controller: AbortController } | null = null
  renderTimer: ReturnType<typeof setTimeout> | null = null
  runIds = 0

  constructor(private world: World) {
    this.renderedVars = world.vars
    const deps: CellRefreshDeps = {
      executeSingle: (sql, signal) =>
        world.exec("engine", sql, this.renderedVars, signal),
      validateWithGlobals: (sql) =>
        Promise.resolve({ query: sql, columns: [], timestamp: 0 }),
      setCellResult: (cellId, result) =>
        world.setCells(
          world.cells.map((c) => (c.id === cellId ? { ...c, result } : c)),
        ),
      getCellResult: (cellId) => world.cell(cellId)?.result,
      hasStaleStatementBindings: (statement) =>
        statement.type === "dql" &&
        statement.effectiveQuery !== undefined &&
        hasChangedBindings(
          statement.query,
          statement.effectiveQuery,
          world.vars,
        ),
      isDrawCell: (cellId) => world.cell(cellId)?.mode === "draw",
      isCellRunning: (cellId) => this.exec.isCellRunning(cellId),
      resultLoadStatus: (cellId) => this.hydration.statusOf(cellId),
      subscribeResultLoad: (cellId, listener) =>
        this.hydration.subscribe(cellId, listener),
      requestResultLoad: (cellId) => this.hydration.request(cellId),
      noteResultMissing: (cellId) => this.hydration.noteMissing(cellId),
      reviveResultLoad: (cellId) => this.hydration.reviveMissing(cellId),
      onSnapshotPersisted: (cellId, results) =>
        this.hydration.notePersisted(cellId, results),
    }
    this.engine = new CellRefreshEngine(BUFFER_ID, () => deps, {
      initialFetchJitterMs: 0,
      requestLimiter: createRequestLimiter(64),
    })
    this.engine.attach()
    this.hydration = new CellResultHydrationEngine({
      loadSnapshot: (cellId) =>
        new Promise((resolve) =>
          setTimeout(() => resolve(world.disk.get(cellId)), 5),
        ),
      rewriteSnapshot: (snapshot) => world.persist(snapshot),
      deleteSnapshot: (cellId) => {
        world.disk.delete(cellId)
        return Promise.resolve()
      },
      getCell: (cellId) => world.cell(cellId),
      applyResult: (cellId, result) =>
        world.setCells(
          world.cells.map((c) =>
            c.id === cellId && c.result == null ? { ...c, result } : c,
          ),
        ),
      releaseResult: (cellId) =>
        world.setCells(
          world.cells.map((c) =>
            c.id === cellId ? { ...c, ...releaseCellResultPatch(c) } : c,
          ),
        ),
      canRelease: (cellId) =>
        !world.visible.has(cellId) &&
        !this.running.has(cellId) &&
        !this.exec.isCellRunning(cellId) &&
        !this.engine.isRefreshing(cellId),
      seedRefreshState: (cellId, seed) =>
        this.engine.seedRefreshState(cellId, seed),
    })
    const updateCells = (updater: (prev: NotebookCell[]) => NotebookCell[]) =>
      world.setCells(updater(world.cellsRef.current))
    const hook = renderHook(() =>
      useCellExecution({
        bufferId: BUFFER_ID,
        cellsRef: world.cellsRef,
        executeSingle: (sql, signal) =>
          world.exec("foreground", sql, this.renderedVars, signal),
        validateWithGlobals: (sql, signal) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => resolve({ query: sql, columns: [], timestamp: 0 }),
              50,
            )
            signal?.addEventListener("abort", () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            })
          }),
        updateCellResult: (cellId, index, result, activeIndex) =>
          updateCells((prev) =>
            prev.map((c) => {
              if (c.id !== cellId || !c.result) return c
              const results = [...c.result.results]
              results[index] = result
              const next: CellResult = {
                ...c.result,
                results,
                ...(activeIndex !== undefined
                  ? { activeResultIndex: activeIndex }
                  : {}),
              }
              return { ...c, result: next }
            }),
          ),
        updateCell: (cellId, updates) =>
          updateCells((prev) =>
            prev.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
          ),
        updateCells,
        setScriptSummary: () => undefined,
        onSnapshotPersisted: (cellId, results) =>
          this.hydration.notePersisted(cellId, results),
      }),
    )
    this.exec = hook.result.current
    this.unmountHook = hook.unmount
    // The hook's own renders only track running cells; nothing here reads
    // them, so they run outside act.
    setActEnvironment(false)
  }

  start() {
    this.world.mount = this
    this.render()
    for (const cellId of this.world.visible) this.reveal(cellId)
  }

  runPending(cellId: string) {
    return this.running.has(cellId)
  }

  scheduleRender() {
    if (this.renderTimer) return
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      this.render()
    }, 0)
  }

  // A React commit: the engines see the new cells, then the provider's
  // effect redeems a selection's refresh with the values just rendered.
  render() {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = null
    }
    const varsChanged = this.renderedVars !== this.world.vars
    this.renderedVars = this.world.vars
    this.engine.sync(this.world.cells, undefined)
    this.hydration.sync(this.world.cells)
    if (varsChanged) this.redeemVariableRefresh()
  }

  private hasStaleBindings = (statement: SingleQueryResult) =>
    statement.type === "dql" &&
    statement.effectiveQuery !== undefined &&
    hasChangedBindings(
      statement.query,
      statement.effectiveQuery,
      this.world.vars,
    )

  private redeemVariableRefresh() {
    const names = this.pendingVariableRefresh
    if (names.length === 0) return
    this.pendingVariableRefresh = []
    const changedNames = affectedVariables(names, this.renderedVars)
    const readWithCurrentValues = (cellId: string) => {
      const results = this.world.cell(cellId)?.result?.results
      return (
        results !== undefined &&
        results.length > 0 &&
        results.every(
          (r) =>
            r.type === "dql" &&
            r.effectiveQuery !== undefined &&
            !this.hasStaleBindings(r),
        )
      )
    }
    this.engine.refreshWhere(
      (cellId, sql) =>
        usesVariables(sql, changedNames) && !readWithCurrentValues(cellId),
      this.world.cellsRef.current,
    )
  }

  setVariableValues(values: Record<string, string>) {
    const current = this.world.vars
    const names = Object.keys(values).filter(
      (name) => current.find((v) => v.name === name)?.value !== values[name],
    )
    const repeated = Object.keys(values).filter((name) => !names.includes(name))
    if (repeated.length > 0) {
      const used = affectedVariables(repeated, current)
      const fetching = this.engine.readRefreshState()
      const running: string[] = []
      this.engine.refreshWhere((cellId, sql) => {
        if (!usesVariables(sql, used)) return false
        const stale = (this.world.cell(cellId)?.result?.results ?? []).some(
          this.hasStaleBindings,
        )
        if (!stale) return false
        if (fetching.get(cellId)?.refreshing === true) {
          running.push(cellId)
          return false
        }
        return true
      }, this.world.cellsRef.current)
      this.engine.recheckBindingsAfterRound(running)
    }
    if (names.length === 0) return
    this.world.vars = current.map((v) =>
      names.includes(v.name) ? { ...v, value: values[v.name] } : v,
    )
    this.pendingVariableRefresh = [
      ...new Set([...this.pendingVariableRefresh, ...names]),
    ]
  }

  applyVariables(values: Record<string, string>) {
    this.world.vars = this.world.vars.map((v) =>
      v.name in values ? { ...v, value: values[v.name] } : v,
    )
  }

  async runCellNow(cellId: string, sql?: string, signal?: AbortSignal) {
    const queryKey = ++this.runIds
    this.activeKeys.set(cellId, queryKey)
    this.running.add(cellId)
    this.engine.noteRunStarted(cellId)
    try {
      const outcome = await this.exec.runCell(cellId, sql, signal)
      if (outcome.result) this.engine.noteCellRan(cellId)
      return outcome
    } finally {
      const ownsRun = this.activeKeys.get(cellId) === queryKey
      if (signal?.aborted && ownsRun) this.engine.discardVariableRefresh(cellId)
      this.engine.noteRunFinished(cellId, this.world.cell(cellId))
      if (ownsRun) {
        this.activeKeys.delete(cellId)
        this.running.delete(cellId)
      }
    }
  }

  async reRunResultAt(cellId: string, index: number) {
    this.running.add(cellId)
    this.engine.noteRunStarted(cellId, true)
    const result = this.world.cell(cellId)?.result
    const statementKey = result
      ? statementKeysFor(result.results.map((r) => r.query))[index]
      : undefined
    try {
      const outcome = await this.exec.reRunResultAt(cellId, index)
      if (outcome.committed && statementKey !== undefined)
        this.engine.noteStatementRan(cellId, statementKey)
      return outcome
    } finally {
      this.engine.noteRunFinished(cellId, this.world.cell(cellId))
      this.running.delete(cellId)
    }
  }

  cancelCell(cellId: string) {
    this.engine.discardVariableRefresh(cellId)
    this.exec.cancelCell(cellId)
  }

  cancelStatement(cellId: string, sid: string) {
    const cell = this.world.cell(cellId)
    const stmts = this.world.stmts.get(cellId) ?? []
    const stmt = stmts.find((s) => s.sid === sid)
    if (!cell || !stmt) return
    const key = statementKeysFor(stmts.map(stmtText))[stmts.indexOf(stmt)]
    if (this.engine.getState(cellId)?.slotFetching.has(key)) {
      this.engine.cancelSlot(cellId, key)
      return
    }
    const index = (cell.result?.results ?? []).findIndex(
      (r) => norm(r.query) === norm(stmtText(stmt)),
    )
    if (index !== -1) this.exec.cancelQuery(cellId, index)
  }

  stopChart(cellId: string) {
    this.engine.cancelChartFetch(cellId)
  }

  chartFetching(cellId: string) {
    return this.engine.getState(cellId)?.fetching === true
  }

  // The slots a Stop can reach: an engine read in flight, or a statement
  // the foreground run is executing.
  runningSlots(cellId: string): string[] {
    const stmts = this.world.stmts.get(cellId) ?? []
    const keys = statementKeysFor(stmts.map(stmtText))
    const fetching = this.engine.getState(cellId)?.slotFetching
    const cell = this.world.cell(cellId)
    return stmts
      .filter((stmt, index) => {
        if (fetching?.has(keys[index])) return true
        if (!this.exec.isCellRunning(cellId)) return false
        return (cell?.result?.results ?? []).some(
          (r) => r.type === "running" && norm(r.query) === norm(stmtText(stmt)),
        )
      })
      .map((stmt) => stmt.sid)
  }

  reveal(cellId: string) {
    this.engine.setVisible(cellId, true)
    this.hydration.request(cellId)
    this.engine.requestHydrate(cellId)
  }

  conceal(cellId: string) {
    this.engine.setVisible(cellId, false)
    this.hydration.noteReleasable(cellId)
  }

  unmount() {
    if (this.renderTimer) clearTimeout(this.renderTimer)
    this.engine.destroy()
    this.hydration.destroy()
    this.unmountHook()
  }
}

// ---------------------------------------------------------------- scenario

const flush = () => vi.advanceTimersByTimeAsync(0)

const setActEnvironment = (enabled: boolean) => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = enabled
}

const settle = async (world: World) => {
  for (let round = 0; round < 60; round++) {
    await flush()
    const pending = world.pending()
    if (pending.length > 0) {
      pending.forEach((r) => r.settle(true))
      continue
    }
    await vi.advanceTimersByTimeAsync(400)
    if (world.pending().length > 0) continue
    await vi.advanceTimersByTimeAsync(11_000)
    if (world.pending().length === 0) break
  }
  world.checkQuiescent()
}

const applyEvent = async (world: World, event: HarnessEvent) => {
  const mount = world.mount
  switch (event.t) {
    case "click": {
      const before = valueOf(world.vars, event.v)
      if (before === event.value) {
        // A repeated value asks for the cells still showing other rows.
        const used = affectedVariables([event.v], world.vars)
        for (const cell of world.cells) {
          if (usesVariables(cell.value, used))
            world.explicitRefresh(
              (world.stmts.get(cell.id) ?? []).map((s) => s.sid),
            )
        }
      }
      mount.setVariableValues({ [event.v]: event.value })
      world.updateTargets()
      mount.render()
      return
    }
    case "apply": {
      if (valueOf(world.vars, event.v) === event.value) return
      mount.applyVariables({ [event.v]: event.value })
      for (const sid of world.updateTargets())
        world.slot(sid).exempt = world.mark(sid)
      mount.render()
      return
    }
    case "run": {
      const cellId = world.cellIdAt(event.cell)
      if (!cellId || world.kinds.get(cellId) !== "grid") return
      if (mount.running.has(cellId) || mount.exec.isCellRunning(cellId)) return
      const stmts = world.stmts.get(cellId) ?? []
      if (stmts.length === 0) return
      const ran = world.ran.get(cellId) ?? new Set<string>()
      world.ran.set(cellId, ran)
      if (event.scope === "one") {
        const results = world.cell(cellId)?.result?.results ?? []
        if (results.length === 0) return
        const index = event.pick % results.length
        const query = results[index].query
        ran.add(norm(query))
        const sid = sidOf(query)
        if (sid) world.explicitRefresh([sid])
        void mount.reRunResultAt(cellId, index)
        return
      }
      let sql: string | undefined
      let ranStmts = stmts
      if (event.scope === "selection") {
        if (stmts.length < 2) return
        const stmt = stmts[event.pick % stmts.length]
        sql = stmtText(stmt)
        ranStmts = [stmt]
      }
      ranStmts.forEach((s) => ran.add(norm(stmtText(s))))
      world.explicitRefresh(ranStmts.map((s) => s.sid))
      const controller = event.agent ? new AbortController() : undefined
      if (controller) mount.agent = { cellId, controller }
      const valueAtStart = world.cell(cellId)?.value
      const runStmts = ranStmts.map((s) => norm(stmtText(s)))
      void mount.runCellNow(cellId, sql, controller?.signal).then((outcome) => {
        if (!outcome.result || mount !== world.mount) return
        const cell = world.cell(cellId)
        world.lastFullRun.set(
          cellId,
          event.scope === "whole" && cell?.value === valueAtStart
            ? runStmts
            : null,
        )
      })
      return
    }
    case "stopSlot": {
      const cellId = world.cellIdAt(event.cell)
      if (!cellId || world.kinds.get(cellId) !== "grid") return
      const candidates = mount.runningSlots(cellId)
      if (candidates.length === 0) return
      const sid = candidates[event.pick % candidates.length]
      world.slot(sid).stopped = world.mark(sid)
      mount.cancelStatement(cellId, sid)
      return
    }
    case "stopCell": {
      const cellId = world.cellIdAt(event.cell)
      if (!cellId) return
      const sids = (world.stmts.get(cellId) ?? []).map((s) => s.sid)
      if (world.kinds.get(cellId) === "chart") {
        if (!mount.chartFetching(cellId)) return
        sids.forEach((sid) => (world.slot(sid).stopped = world.mark(sid)))
        mount.stopChart(cellId)
        return
      }
      if (!mount.running.has(cellId)) return
      sids.forEach((sid) => (world.slot(sid).stopped = world.mark(sid)))
      mount.cancelCell(cellId)
      return
    }
    case "chatStop": {
      const agent = mount.agent
      if (!agent || !mount.running.has(agent.cellId)) return
      mount.agent = null
      for (const stmt of world.stmts.get(agent.cellId) ?? [])
        world.slot(stmt.sid).stopped = world.mark(stmt.sid)
      agent.controller.abort()
      return
    }
    case "complete": {
      const pending = world.pending()
      if (pending.length === 0) return
      pending[event.pick % pending.length].settle(event.ok)
      return
    }
    case "edit": {
      const cellId = world.cellIdAt(event.cell)
      const cell = cellId ? world.cell(cellId) : undefined
      if (!cellId || !cell) return
      const stmts = [...(world.stmts.get(cellId) ?? [])]
      let value: string
      if (event.kind === "space") {
        value = `${cell.value}\n  `
      } else {
        if (event.kind === "modify" && stmts.length > 0) {
          const index = event.pick % stmts.length
          world.retired.set(stmts[index].sid, { cellId, stmt: stmts[index] })
          stmts[index] = world.newStmt(event.expr)
        } else {
          stmts.push(world.newStmt(event.expr))
        }
        world.stmts.set(cellId, stmts)
        world.updateTargets()
        value = stmts.map(stmtText).join(";\n")
      }
      world.setCells(
        world.cells.map((c) => (c.id === cellId ? { ...c, value } : c)),
      )
      mount.render()
      return
    }
    case "hide": {
      const cellId = world.cellIdAt(event.cell)
      if (!cellId || !world.visible.has(cellId)) return
      world.visible.delete(cellId)
      mount.conceal(cellId)
      return
    }
    case "show": {
      const cellId = world.cellIdAt(event.cell)
      if (!cellId || world.visible.has(cellId)) return
      world.visible.add(cellId)
      mount.reveal(cellId)
      return
    }
    case "tick":
      await vi.advanceTimersByTimeAsync(60_000)
      return
    case "wait":
      await vi.advanceTimersByTimeAsync(event.ms)
      return
    case "settle":
      await settle(world)
      return
    case "reload": {
      mount.unmount()
      await flush()
      world.setCells(
        world.cells.map((c) => {
          const { result: _result, ...rest } = c
          return rest
        }),
      )
      for (const record of world.slots.values()) {
        record.explicit++
        record.stopped = undefined
        record.exempt = undefined
        record.failed = undefined
      }
      new Mount(world).start()
      return
    }
  }
}

const runScenario = async (
  scenario: Scenario,
  trace?: string[],
): Promise<Violation[]> => {
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
  clearStatementClassCache()
  const world = new World(scenario.cells)
  vi.mocked(persistCellSnapshot).mockImplementation((snapshot) =>
    world.persist(snapshot),
  )
  vi.mocked(deleteCellSnapshot).mockImplementation((_bufferId, cellId) => {
    world.disk.delete(cellId)
    return Promise.resolve()
  })
  vi.mocked(updateCellSnapshotActiveIndex).mockResolvedValue(undefined)
  try {
    new Mount(world).start()
    await flush()
    for (const [index, event] of scenario.events.entries()) {
      world.eventIndex = index
      world.trace.push(`#${index} ${JSON.stringify(event)}`)
      await applyEvent(world, event)
      await flush()
    }
    world.eventIndex = scenario.events.length
    world.trace.push(`#${scenario.events.length} settle`)
    await settle(world)
    return world.violations
  } finally {
    trace?.push(...world.trace)
    world.mount.unmount()
    world.pending().forEach((r) => r.settle(true))
    await flush()
    vi.clearAllTimers()
    vi.useRealTimers()
  }
}

// Drops events while the scenario still breaks the same invariant.
const minimize = async (
  scenario: Scenario,
  invariant: number,
): Promise<Scenario> => {
  const fails = async (events: HarnessEvent[]) =>
    (await runScenario({ ...scenario, events })).some(
      (v) => v.invariant === invariant,
    )
  let events = scenario.events
  for (let chunk = Math.ceil(events.length / 2); chunk >= 1; ) {
    let removed = false
    for (let start = 0; start < events.length; start += chunk) {
      const candidate = [
        ...events.slice(0, start),
        ...events.slice(start + chunk),
      ]
      if (await fails(candidate)) {
        events = candidate
        removed = true
        break
      }
    }
    if (!removed) chunk = Math.floor(chunk / 2)
  }
  return { ...scenario, events }
}

// ------------------------------------------------------------------- tests

const SEEDS = Number(process.env.REFRESH_INVARIANT_SEEDS ?? 300)
const FIRST_SEED = Number(process.env.REFRESH_INVARIANT_FIRST_SEED ?? 1)

const grid = (
  exprs: Expr[],
  snapshot: CellSpec["snapshot"] = "current",
  autoRefresh: AutoRefresh = false,
): CellSpec => ({ kind: "grid", exprs, autoRefresh, visible: true, snapshot })

const chart = (exprs: Expr[]): CellSpec => ({
  kind: "chart",
  exprs,
  autoRefresh: false,
  visible: true,
  snapshot: "current",
})

const click = (v: VarName, value: string): HarnessEvent => ({
  t: "click",
  v,
  value,
})

// The restore check of a stale snapshot has started its read.
const LOADED: HarnessEvent = { t: "wait", ms: 350 }

describe("variable refresh invariants", () => {
  const found = new Map<number, Array<{ seed: number } & Violation>>()

  beforeAll(async () => {
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed++) {
      const violations = await runScenario(generateScenario(seed))
      for (const violation of violations) {
        const list = found.get(violation.invariant) ?? []
        list.push({ seed, ...violation })
        found.set(violation.invariant, list)
      }
    }
  }, 600_000)

  afterAll(async () => {
    if (!process.env.REFRESH_INVARIANT_REPORT) return
    for (const [invariant, list] of [...found].sort(([a], [b]) => a - b)) {
      const seeds = [...new Set(list.map((v) => v.seed))]
      console.info(
        `invariant ${invariant}: ${list.length} violations in ${seeds.length} seeds`,
      )
      const limit = Number(process.env.REFRESH_INVARIANT_MINIMIZE ?? 0)
      for (const seed of seeds.slice(0, limit)) {
        const small = await minimize(generateScenario(seed), invariant)
        console.info(`  seed ${seed}:`, JSON.stringify(small))
        if (process.env.REFRESH_INVARIANT_TRACE) {
          const trace: string[] = []
          await runScenario(small, trace)
          console.info(trace.join("\n"))
        }
      }
    }
  }, 600_000)

  if (process.env.REFRESH_INVARIANT_SCENARIO) {
    it("traces one scenario", async () => {
      const trace: string[] = []
      await runScenario(
        JSON.parse(process.env.REFRESH_INVARIANT_SCENARIO ?? "") as Scenario,
        trace,
      )
      console.info(trace.join("\n"))
    })
  }

  const holds = (invariant: number) => () =>
    expect(found.get(invariant)?.slice(0, 3) ?? []).toEqual([])

  // Today's engine breaks 1–4 on random sequences; the cases below are the
  // minimized sequences, one per distinct cause.
  it.fails(
    `1: a visible stale slot gets current rows (${SEEDS} seeds)`,
    holds(1),
  )
  it.fails(`2: the engine never re-reads a target (${SEEDS} seeds)`, holds(2))
  it.fails(`3: a Stop holds for its target (${SEEDS} seeds)`, holds(3))
  it.fails(
    `4: the engine runs only SQL the user ran (${SEEDS} seeds)`,
    holds(4),
  )
  it(`5: one fetch at a time per cell and slot (${SEEDS} seeds)`, holds(5))
  it(
    `6: a saved snapshot matches the rows on screen (${SEEDS} seeds)`,
    holds(6),
  )

  const holdsFor = (scenario: Scenario) => async () =>
    expect(await runScenario(scenario)).toEqual([])

  it.fails(
    "1: returning to the shown value while a read for another value runs keeps that read's rows",
    holdsFor({
      cells: [grid(["@a"])],
      events: [
        click("a", "'y'"),
        { t: "settle" },
        click("a", "'x'"),
        click("a", "'y'"),
      ],
    }),
  )

  it.fails(
    "1: selecting the value a stale snapshot shows while its restore read runs keeps the restore read's rows",
    holdsFor({
      cells: [grid(["@a"], "stale")],
      events: [LOADED, click("a", "'y'")],
    }),
  )

  it.fails(
    "1: an auto-refresh cell whose first tick beats its snapshot load never checks the restored bindings",
    holdsFor({ cells: [grid(["@b"], "stale", "1m")], events: [] }),
  )

  it.fails(
    "2: a selection re-reads a sibling statement that does not use the variable",
    holdsFor({ cells: [grid(["@a", "1"])], events: [click("a", "'y'")] }),
  )

  it.fails(
    "2: a selection re-reads a chart statement that does not use the variable",
    holdsFor({
      cells: [chart(["@a", "1"])],
      events: [{ t: "settle" }, click("a", "'y'")],
    }),
  )

  it.fails(
    "2: a selection made while a Run validates re-runs the cell after the Run read the new value",
    holdsFor({
      cells: [grid(["@a"])],
      events: [
        { t: "edit", cell: 0, kind: "append", pick: 0, expr: "@a" },
        { t: "run", cell: 0, scope: "whole", pick: 0 },
        click("a", "'y'"),
      ],
    }),
  )

  it.fails(
    "2: a selection made before a snapshot loads re-reads rows that already match it",
    holdsFor({ cells: [grid(["@a"], "stale")], events: [click("a", "'y'")] }),
  )

  it.fails(
    "3: a Stop after a repeated click is undone when the cell's round ends",
    holdsFor({
      cells: [grid(["@a"], "stale")],
      events: [LOADED, click("a", "'x'"), { t: "stopSlot", cell: 0, pick: 0 }],
    }),
  )

  it.fails(
    "3: a selection of another variable re-runs a statement the user stopped",
    holdsFor({
      cells: [grid(["@b", "@a"], "stale")],
      events: [LOADED, { t: "stopSlot", cell: 0, pick: 0 }, click("a", "'z'")],
    }),
  )

  it.fails(
    "4: a repeated click during a round runs a statement edited inside the debounce once the round ends",
    holdsFor({
      cells: [grid(["@a"], "stale")],
      events: [
        LOADED,
        { t: "edit", cell: 0, kind: "modify", pick: 0, expr: "@a" },
        click("a", "'z'"),
        click("a", "'z'"),
      ],
    }),
  )
})
