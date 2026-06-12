/*
 * Result-grid A/B benchmark runner (dev-only).
 *
 * Measures "input -> fully repainted AND correct" wall-clock for the legacy
 * grid.js and the React ResultGrid under the same synthetic data, so the two can
 * be compared. Grid-agnostic: it detects the mounted grid and drives the right
 * DOM/key transport (new grid: [data-hook=...] + [role=grid]; legacy: .qg-* +
 * keyCode on .qg-canvas).
 *
 * Each step's settle is only accepted once ALL of these hold (else it keeps
 * waiting up to the timeout and the step is marked failed):
 *   1. every visible cell shows the value for its own (row, col) — the mock
 *      seeds self-describing "r{row}c{col}" values, so this catches blank,
 *      stale, or column-misaligned cells;
 *   2. the rendered cells cover the viewport's content area (no half-painted
 *      scroll counts as done);
 *   3. for keyboard moves, the focused cell is at the EXPECTED (row, col) and
 *      holds the expected value.
 *
 * Requires window.__benchSeed (mock.pagination flag). See BENCHMARK.md.
 *
 * Usage:  await window.__gridBench.run("vscroll_1m")  ->  stats incl. `failures`
 */
;(() => {
  const $ = (s) => document.querySelector(s)
  const isNewGrid = () => !!$('[data-hook="grid-viewport"]')
  const viewport = () => $('[data-hook="grid-viewport"]') || $(".qg-viewport")
  const keyTarget = () =>
    isNewGrid() ? $('[role="grid"]') : $(".qg-viewport .qg-canvas")
  const cellSel = () => (isNewGrid() ? '[data-hook="grid-cell"]' : ".qg-c")
  const activeSel = () =>
    isNewGrid() ? '[data-hook="grid-cell"][aria-selected="true"]' : ".qg-c-active"
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()))

  const PAGE = 1000
  const MAX_VIRTUAL_ROWS = Math.floor(10_000_000 / 30)

  // The canned page repeats every PAGE rows, so absolute row R shows row R % PAGE.
  const expectedText = (absRow, col) => `r${((absRow % PAGE) + PAGE) % PAGE}c${col}`

  // { col, absRow, focusRow } for a cell. focusRow is the row index in the grid's
  // own focus space (new grid: virtual row from the id; legacy: absolute row).
  const cellCoord = (cell) => {
    if (isNewGrid()) {
      const m = /^cell-(\d+)-(\d+)$/.exec(cell.id || "")
      if (!m) return null
      const rowEl = cell.closest('[role="row"]')
      const aria = rowEl ? parseInt(rowEl.getAttribute("aria-rowindex"), 10) : NaN
      return { focusRow: +m[1], col: +m[2], absRow: aria - 2 }
    }
    const absRow = cell.parentElement ? cell.parentElement.rowIndex : NaN
    return { focusRow: absRow, col: cell.columnIndex, absRow }
  }

  const visibleCells = () => {
    const vp = viewport()
    if (!vp) return []
    const vr = vp.getBoundingClientRect()
    return [...vp.querySelectorAll(cellSel())].filter((c) => {
      const r = c.getBoundingClientRect()
      return (
        r.bottom > vr.top &&
        r.top < vr.bottom &&
        r.right > vr.left &&
        r.left < vr.right
      )
    })
  }

  // Diagnostic for the most recent failed predicate check.
  let lastFail = ""

  const visibleAllCorrect = () => {
    const vp = viewport()
    if (!vp) return (lastFail = "no viewport"), false
    const vr = vp.getBoundingClientRect()
    const cells = visibleCells()
    if (!cells.length) return (lastFail = "no cells"), false
    let maxRight = -Infinity
    let maxBottom = -Infinity
    for (const c of cells) {
      const co = cellCoord(c)
      if (!co || Number.isNaN(co.absRow)) return (lastFail = "bad coord"), false
      const exp = expectedText(co.absRow, co.col)
      const got = c.textContent.trim()
      if (got !== exp)
        return (lastFail = `cell(${co.absRow},${co.col})="${got}" exp="${exp}"`), false
      const r = c.getBoundingClientRect()
      if (r.right > maxRight) maxRight = r.right
      if (r.bottom > maxBottom) maxBottom = r.bottom
    }
    if (maxRight < vr.left + vp.clientWidth - 4) return (lastFail = "x-coverage"), false
    if (maxBottom < vr.top + vp.clientHeight - 4) return (lastFail = "y-coverage"), false
    return true
  }

  const readActive = () => {
    const a = $(activeSel())
    if (!a) return null
    const co = cellCoord(a)
    return co ? { ...co, text: a.textContent.trim() } : null
  }

  // Run `act`, then wait until the grid is fully repainted-and-correct. When
  // `exp` is given, the focused cell must also be at exp.{row,col} with the
  // value for its position. Returns { ms, ok, reason }.
  const settleAfter = async (act, exp, timeout = 4000) => {
    const t0 = performance.now()
    act()
    await raf()
    let reason = "timeout"
    while (performance.now() - t0 < timeout) {
      if (visibleAllCorrect()) {
        if (!exp) return { ms: performance.now() - t0, ok: true }
        const a = readActive()
        if (
          a &&
          a.focusRow === exp.row &&
          a.col === exp.col &&
          a.text === expectedText(a.absRow, a.col)
        )
          return { ms: performance.now() - t0, ok: true }
        reason = a
          ? `active(${a.focusRow},${a.col})="${a.text}" exp(${exp.row},${exp.col})`
          : "no active cell"
      } else {
        reason = lastFail
      }
      await raf()
    }
    return { ms: performance.now() - t0, ok: false, reason }
  }

  const dispatchNew = (key, mods) =>
    keyTarget().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }),
    )
  const dispatchOld = (keyCode, mods = {}) => {
    const canvas = keyTarget()
    const fire = (kc, type = "keydown") => {
      const e = new KeyboardEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, "keyCode", { get: () => kc })
      Object.defineProperty(e, "which", { get: () => kc })
      canvas.dispatchEvent(e)
    }
    if (mods.ctrl) fire(17)
    if (mods.cmd) fire(91)
    fire(keyCode)
    if (mods.ctrl) fire(17, "keyup")
    if (mods.cmd) fire(91, "keyup")
  }
  const KEY = {
    right: () => (isNewGrid() ? dispatchNew("ArrowRight") : dispatchOld(39)),
    down: () => (isNewGrid() ? dispatchNew("ArrowDown") : dispatchOld(40)),
    home: () => (isNewGrid() ? dispatchNew("Home") : dispatchOld(36)),
    end: () => (isNewGrid() ? dispatchNew("End") : dispatchOld(35)),
    pageDown: () => (isNewGrid() ? dispatchNew("PageDown") : dispatchOld(34)),
    pageUp: () => (isNewGrid() ? dispatchNew("PageUp") : dispatchOld(33)),
    // Corner jumps: one Ctrl chord on the new grid; a column key then a Cmd row
    // key on the legacy grid, which has no single corner chord.
    topLeft: () =>
      isNewGrid()
        ? dispatchNew("Home", { ctrlKey: true })
        : (dispatchOld(36), dispatchOld(38, { cmd: true })),
    bottomRight: () =>
      isNewGrid()
        ? dispatchNew("End", { ctrlKey: true })
        : (dispatchOld(35), dispatchOld(40, { cmd: true })),
  }

  const lastCol = (cols) => cols - 1
  const focusLastRow = (rows) =>
    (isNewGrid() ? Math.min(rows, MAX_VIRTUAL_ROWS) : rows) - 1

  // Click the top-left visible cell and return where focus actually landed.
  const focusTopLeft = async () => {
    const vp = viewport()
    vp.scrollTop = 0
    vp.scrollLeft = 0
    await raf()
    await raf()
    const cells = visibleCells().sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      return ra.top - rb.top || ra.left - rb.left
    })
    if (cells[0]) cells[0].click()
    await raf()
    const a = readActive()
    return a ? { row: a.focusRow, col: a.col } : { row: 0, col: 0 }
  }

  const prng = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280

  const randomScroll = async (axis, steps) => {
    const vp = viewport()
    const rnd = prng(20240611)
    const samples = []
    const fails = []
    for (let i = 0; i < steps; i++) {
      const max =
        axis === "vertical"
          ? vp.scrollHeight - vp.clientHeight
          : vp.scrollWidth - vp.clientWidth
      const pos = Math.floor(rnd() * max)
      const r = await settleAfter(() => {
        if (axis === "vertical") vp.scrollTop = pos
        else vp.scrollLeft = pos
        vp.dispatchEvent(new Event("scroll"))
      }, null)
      samples.push(r.ms)
      if (!r.ok) fails.push(r.reason)
    }
    return { samples, fails }
  }

  // Alternate two [key, transition(cur)->cur] descriptors for `steps` presses.
  const keyAlternate = async (cols, rows, moves, steps) => {
    let cur = await focusTopLeft()
    const samples = []
    const fails = []
    for (let i = 0; i < steps; i++) {
      const move = moves[i % moves.length]
      cur = move.next(cur, cols, rows)
      const r = await settleAfter(move.key, cur)
      samples.push(r.ms)
      if (!r.ok) fails.push(r.reason)
    }
    return { samples, fails }
  }

  const keyRepeat = async (cols, rows, move, steps) => {
    let cur = await focusTopLeft()
    const samples = []
    const fails = []
    for (let i = 0; i < steps; i++) {
      cur = move.next(cur, cols, rows)
      const r = await settleAfter(move.key, cur, 2000)
      samples.push(r.ms)
      if (!r.ok) fails.push(r.reason)
    }
    return { samples, fails }
  }

  // 100 PageDown then 100 PageUp. The page size is calibrated from the first
  // move (it differs slightly between the two grids), then asserted exactly.
  const pageThrough = async (rows) => {
    let cur = await focusTopLeft()
    const flr = focusLastRow(rows)
    const samples = []
    const fails = []
    let pageRows = null
    for (let i = 0; i < 100; i++) {
      let r
      if (pageRows === null) {
        const before = cur.row
        r = await settleAfter(KEY.pageDown, null)
        const a = readActive()
        if (a) {
          pageRows = a.focusRow - before
          cur = { row: a.focusRow, col: a.col }
        }
      } else {
        cur = { row: Math.min(cur.row + pageRows, flr), col: cur.col }
        r = await settleAfter(KEY.pageDown, cur)
      }
      samples.push(r.ms)
      if (!r.ok) fails.push(r.reason)
    }
    for (let i = 0; i < 100; i++) {
      cur = { row: Math.max(cur.row - pageRows, 0), col: cur.col }
      const r = await settleAfter(KEY.pageUp, cur)
      samples.push(r.ms)
      if (!r.ok) fails.push(r.reason)
    }
    return { samples, fails }
  }

  const END = { key: KEY.end, next: (c, cols) => ({ row: c.row, col: lastCol(cols) }) }
  const HOME = { key: KEY.home, next: (c) => ({ row: c.row, col: 0 }) }
  const RIGHT = {
    key: KEY.right,
    next: (c, cols) => ({ row: c.row, col: Math.min(c.col + 1, lastCol(cols)) }),
  }
  const DOWN = {
    key: KEY.down,
    next: (c, cols, rows) => ({ row: Math.min(c.row + 1, focusLastRow(rows)), col: c.col }),
  }
  const BR = {
    key: KEY.bottomRight,
    next: (c, cols, rows) => ({ row: focusLastRow(rows), col: lastCol(cols) }),
  }
  const TL = { key: KEY.topLeft, next: () => ({ row: 0, col: 0 }) }

  const CASES = {
    vscroll_1m: {
      title: "Randomized vertical scroll — 1,000,000 rows",
      rows: 1_000_000,
      cols: 20,
      run: () => randomScroll("vertical", 100),
    },
    hscroll_10k: {
      title: "Randomized horizontal scroll — 10,000 columns",
      rows: 2_000,
      cols: 10_000,
      run: () => randomScroll("horizontal", 100),
    },
    homeend_cols: {
      title: "Home / End across 10,000 columns — 100 End/Home combinations",
      rows: 2_000,
      cols: 10_000,
      run: (rows, cols) => keyAlternate(cols, rows, [END, HOME], 200),
    },
    pagedn_10k: {
      title: "PageDown ×100 then PageUp ×100 — 10,000 rows",
      rows: 10_000,
      cols: 20,
      run: (rows) => pageThrough(rows),
    },
    corners_1m_10k: {
      title: "Corner jumps — bottom-right → top-left ×100 (1,000,000 × 10,000)",
      rows: 1_000_000,
      cols: 10_000,
      run: (rows, cols) => keyAlternate(cols, rows, [BR, TL], 200),
    },
    arrow_right_1k: {
      title: "Right arrow through 1,000 columns",
      rows: 2_000,
      cols: 1_000,
      run: (rows, cols) => keyRepeat(cols, rows, RIGHT, 999),
    },
    arrow_down_1k: {
      title: "Down arrow through 1,000 rows",
      rows: 1_000,
      cols: 20,
      run: (rows, cols) => keyRepeat(cols, rows, DOWN, 999),
    },
  }

  const stats = (samples) => {
    const sorted = samples.slice().sort((a, b) => a - b)
    const pct = (p) =>
      sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))]
    const round = (x) => Math.round(x * 10) / 10
    return {
      steps: samples.length,
      median: round(pct(50)),
      p95: round(pct(95)),
      min: round(sorted[0]),
      max: round(sorted[sorted.length - 1]),
      total: round(samples.reduce((a, b) => a + b, 0)),
    }
  }

  const seedAndReady = async (rows, cols) => {
    if (typeof window.__benchSeed !== "function")
      throw new Error("window.__benchSeed missing — set mock.pagination=true and reload")
    window.__benchSeed(rows, cols)
    const vp = viewport()
    if (vp) {
      vp.scrollTop = 0
      vp.scrollLeft = 0
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 8000) {
      await raf()
      if (visibleAllCorrect()) return
    }
    throw new Error("grid not ready/correct after seed: " + lastFail)
  }

  const run = async (key) => {
    const spec = CASES[key]
    if (!spec) throw new Error("unknown case: " + key)
    await seedAndReady(spec.rows, spec.cols)
    const vp = viewport()
    vp.scrollTop = 0
    vp.scrollLeft = 0
    await raf()
    await raf()
    const suiteStart = performance.now()
    const { samples, fails } = await spec.run(spec.rows, spec.cols)
    return {
      key,
      title: spec.title,
      grid: isNewGrid() ? "ResultGrid" : "legacy",
      rows: spec.rows,
      cols: spec.cols,
      suiteMs: Math.round(performance.now() - suiteStart),
      ...stats(samples),
      failures: fails.length,
      sampleFail: fails[0] || null,
    }
  }

  window.__gridBench = { run, cases: Object.keys(CASES), isNewGrid }
})()
