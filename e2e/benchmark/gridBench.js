/*
 * Result-grid A/B benchmark runner (dev-only).
 *
 * Measures "input -> fully repainted" wall-clock for the legacy grid.js and the
 * React ResultGrid under the same synthetic data, so the two can be compared.
 * It is grid-agnostic: it detects which grid is mounted and drives the right DOM
 * (new grid: [data-hook=...] + [role=grid]; legacy: .qg-viewport / .qg-c /
 * .qg-canvas) and the right key transport (React synthetic key vs keyCode).
 *
 * Requires the page to have window.__benchSeed (added behind the mock.pagination
 * flag — see src/scenes/Result/benchmarkMock.ts and BENCHMARK.md).
 *
 * Usage (console or evaluate):
 *   // inject this file once, then:
 *   await window.__gridBench.run("vscroll_1m")   // one case -> stats object
 *   window.__gridBench.cases                      // list of case keys
 */
;(() => {
  const $ = (sel) => document.querySelector(sel)
  const isNewGrid = () => !!$('[data-hook="grid-viewport"]')
  const viewport = () =>
    $('[data-hook="grid-viewport"]') || $(".qg-viewport")
  const keyTarget = () =>
    isNewGrid() ? $('[role="grid"]') : $(".qg-viewport .qg-canvas")
  const cellSel = () => (isNewGrid() ? '[data-hook="grid-cell"]' : ".qg-c")

  const raf = () => new Promise((r) => requestAnimationFrame(() => r()))

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

  // "Fully repainted": every visible cell shows data AND the rendered cells reach
  // the viewport's right and bottom edges. The edge check rejects the in-between
  // frame where a scroll has revealed area the virtualizer has not filled yet.
  // Coverage is measured against the content area (clientWidth/clientHeight), not
  // the border box, so the scrollbar gutter doesn't make a full grid look unfilled.
  const visibleFilled = () => {
    const vp = viewport()
    if (!vp) return false
    const vr = vp.getBoundingClientRect()
    const cells = visibleCells()
    if (cells.length === 0) return false
    let maxRight = -Infinity
    let maxBottom = -Infinity
    for (const c of cells) {
      if (c.textContent.trim() === "") return false
      const r = c.getBoundingClientRect()
      if (r.right > maxRight) maxRight = r.right
      if (r.bottom > maxBottom) maxBottom = r.bottom
    }
    return (
      maxRight >= vr.left + vp.clientWidth - 4 &&
      maxBottom >= vr.top + vp.clientHeight - 4
    )
  }

  const settleAfter = async (act, timeout = 4000) => {
    const t0 = performance.now()
    act()
    await raf()
    while (!visibleFilled() && performance.now() - t0 < timeout) await raf()
    return performance.now() - t0
  }

  const dispatchNew = (key, mods) =>
    keyTarget().dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...mods,
      }),
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

  // Logical keys mapped to each grid's transport. Corner jumps differ: the new
  // grid reaches a corner with one Ctrl chord; the legacy grid needs a column
  // key then a Cmd row key, so the whole sequence is sent and timed as one move.
  const KEY = {
    right: () => (isNewGrid() ? dispatchNew("ArrowRight") : dispatchOld(39)),
    down: () => (isNewGrid() ? dispatchNew("ArrowDown") : dispatchOld(40)),
    home: () => (isNewGrid() ? dispatchNew("Home") : dispatchOld(36)),
    end: () => (isNewGrid() ? dispatchNew("End") : dispatchOld(35)),
    pageDown: () =>
      isNewGrid() ? dispatchNew("PageDown") : dispatchOld(34),
    pageUp: () => (isNewGrid() ? dispatchNew("PageUp") : dispatchOld(33)),
    topLeft: () =>
      isNewGrid()
        ? dispatchNew("Home", { ctrlKey: true })
        : (dispatchOld(36), dispatchOld(38, { cmd: true })),
    bottomRight: () =>
      isNewGrid()
        ? dispatchNew("End", { ctrlKey: true })
        : (dispatchOld(35), dispatchOld(40, { cmd: true })),
  }

  const clickTopLeftCell = async () => {
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
  }

  // Seeded PRNG so both grids see the exact same scroll positions.
  const prng = (seed) => () =>
    (seed = (seed * 9301 + 49297) % 233280) / 233280

  const randomScroll = async (axis, steps) => {
    const vp = viewport()
    const rnd = prng(20240611)
    const samples = []
    for (let i = 0; i < steps; i++) {
      const max =
        axis === "vertical"
          ? vp.scrollHeight - vp.clientHeight
          : vp.scrollWidth - vp.clientWidth
      const pos = Math.floor(rnd() * max)
      samples.push(
        await settleAfter(() => {
          if (axis === "vertical") vp.scrollTop = pos
          else vp.scrollLeft = pos
          vp.dispatchEvent(new Event("scroll"))
        }),
      )
    }
    return samples
  }

  const keyRepeat = async (key, steps) => {
    await clickTopLeftCell()
    const samples = []
    for (let i = 0; i < steps; i++) samples.push(await settleAfter(key, 2000))
    return samples
  }

  const keyAlternate = async (keys, steps) => {
    await clickTopLeftCell()
    const samples = []
    for (let i = 0; i < steps; i++)
      samples.push(await settleAfter(keys[i % keys.length]))
    return samples
  }

  const pageThrough = async (rows) => {
    await clickTopLeftCell()
    const vp = viewport()
    const rowsPerPage = Math.max(1, Math.floor((vp.clientHeight - 44) / 30))
    const pages = Math.ceil(rows / rowsPerPage)
    const samples = []
    for (let i = 0; i < pages; i++) samples.push(await settleAfter(KEY.pageDown))
    for (let i = 0; i < pages; i++) samples.push(await settleAfter(KEY.pageUp))
    return samples
  }

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
      title: "Home / End across 10,000 columns",
      rows: 2_000,
      cols: 10_000,
      run: () => keyAlternate([KEY.end, KEY.home], 60),
    },
    pagedn_10k: {
      title: "PageDown / PageUp through 10,000 rows",
      rows: 10_000,
      cols: 20,
      run: () => pageThrough(10_000),
    },
    corners_1m_10k: {
      title: "Corner jumps — leftmost-upper / rightmost-lower (1,000,000 × 10,000)",
      rows: 1_000_000,
      cols: 10_000,
      run: () => keyAlternate([KEY.bottomRight, KEY.topLeft], 40),
    },
    arrow_right_1k: {
      title: "Right arrow through 1,000 columns",
      rows: 2_000,
      cols: 1_000,
      run: () => keyRepeat(KEY.right, 999),
    },
    arrow_down_1k: {
      title: "Down arrow through 1,000 rows",
      rows: 1_000,
      cols: 20,
      run: () => keyRepeat(KEY.down, 999),
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
      throw new Error("window.__benchSeed missing — set localStorage mock.pagination=true and reload")
    window.__benchSeed(rows, cols)
    const vp = viewport()
    if (vp) {
      vp.scrollTop = 0
      vp.scrollLeft = 0
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 8000) {
      await raf()
      if (visibleFilled()) return
    }
    throw new Error("grid did not become ready after seeding")
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
    const samples = await spec.run()
    return {
      key,
      title: spec.title,
      grid: isNewGrid() ? "ResultGrid" : "legacy",
      rows: spec.rows,
      cols: spec.cols,
      suiteMs: Math.round(performance.now() - suiteStart),
      ...stats(samples),
    }
  }

  window.__gridBench = { run, cases: Object.keys(CASES), isNewGrid }
})()
