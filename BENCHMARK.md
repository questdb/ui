# Result grid benchmarking harness

How we A/B-compare scroll/keyboard performance of the two result grids — the
legacy `grid.js` and the React `ResultGrid` — during the migration. Latest
numbers live in [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md).

The harness is **dev-only**: every part is gated behind the `mock.pagination`
localStorage flag, so a normal session is unaffected and the code is inert until
you opt in. It is small enough to keep in the tree; this document is how to use
it (and how to strip it if we ever want to).

## What it measures and why

The thing we care about is **input → fully repainted *and correct***: the
wall-clock time from an action (a scroll, a key) landing to the frame where the
grid has actually settled into the right state. A step's timer stops only once
**all** of these hold (else it waits, up to a timeout, and the step is counted as
a failure):

1. every visible cell shows the value for its own `(row, col)` — cells are seeded
   self-describing (`r{row}c{col}`), so this catches blank, stale, *and*
   column-misaligned cells;
2. the rendered cells cover the viewport's content area (no half-painted scroll);
3. for a keyboard move, the focused cell is at the exact expected `(row, col)`
   with the value for that position.

Raw FPS hides this — a grid can paint empty cells instantly and fill them late,
or a synthetic key can silently do nothing. Asserting the end state is what makes
the per-keystroke numbers trustworthy.

Network/API latency dominates and varies run-to-run, so it would drown out the
render cost we're comparing. The harness removes that variable by serving a
**constant canned page at a fixed 10 ms latency** instead of hitting QuestDB.
Both grids go through the same `paginationFn` and the same `setData`, so the mock
applies to both unchanged.

## Part A — the mock data source

Two pieces, both already in the tree:

1. [`src/scenes/Result/benchmarkMock.ts`](src/scenes/Result/benchmarkMock.ts) —
   synthesises a result of any `rows × cols` from one canned page (built once,
   served for every fetch) and exposes `isMockPagination`, `seedMock`,
   `mockPaginate`. Cell values are **self-describing** (`r{row}c{col}`) so the
   runner can assert each rendered cell holds the value for its own position.
2. Three small hooks in
   [`src/scenes/Result/index.tsx`](src/scenes/Result/index.tsx), all guarded by
   `isMockPagination()`:
   - `paginationFn` short-circuits to `mockPaginate` (serves canned pages to
     **both** grids).
   - an effect publishes `window.__benchSeed(rows, cols)`, which seeds either
     grid via `gridRef.setData(...)` — no real query needed.

Enable it at runtime (no rebuild):

```js
localStorage.setItem("mock.pagination", "true")
// reload, then run any query once (e.g. `select 1`) to mount the result pane —
// window.__benchSeed appears once the grid is mounted.
```

`localStorage.removeItem("mock.pagination")` restores normal fetching.

## Part B — the measurement script

[`e2e/benchmark/gridBench.js`](e2e/benchmark/gridBench.js) is a grid-agnostic,
in-page runner. It detects which grid is mounted and drives the right DOM and key
transport:

| | new `ResultGrid` | legacy `grid.js` |
|---|---|---|
| viewport | `[data-hook="grid-viewport"]` | `.qg-viewport` |
| cell | `[data-hook="grid-cell"]` | `.qg-c` |
| active cell | `[aria-selected="true"]` + `cell-{row}-{col}` id | `.qg-c-active` + `.columnIndex` / parent `.rowIndex` |
| key target | `[role="grid"]` (React synthetic key) | `.qg-canvas` (`keyCode`) |

Paste the file's contents into the console (or inject via `page.evaluate`) to
define `window.__gridBench`, then:

```js
await window.__gridBench.run("vscroll_1m")   // → { median, p95, min, max, total, failures, ... }
window.__gridBench.cases                       // all case keys
```

Each `run(key)` seeds the matching `rows × cols`, waits for the grid to fill,
drives the case asserting the end state of every step (focused cell index +
value, and all visible cells correct), and returns median / p95 / min / max /
total settle times plus a **`failures`** count (a step whose assertion never held
within the timeout). `failures` should be `0`; a non-zero count with `sampleFail`
means the run is not trustworthy.

### The seven cases

| key | what it drives | data |
|---|---|---|
| `vscroll_1m` | 100 randomized vertical scrolls | 1,000,000 × 20 |
| `hscroll_10k` | 100 randomized horizontal scrolls | 2,000 × 10,000 |
| `homeend_cols` | 100 End→Home combinations (200 presses) | 2,000 × 10,000 |
| `pagedn_10k` | PageDown ×100 then PageUp ×100 | 10,000 × 20 |
| `corners_1m_10k` | bottom-right → top-left corner jumps via shortcuts, ×100 | 1,000,000 × 10,000 |
| `arrow_right_1k` | 999 ArrowRight presses through the columns | 2,000 × 1,000 |
| `arrow_down_1k` | 999 ArrowDown presses through the rows | 1,000 × 20 |

## Part C — comparing the two grids

The grid is chosen by the `feature.new.grid` flag, settable from the URL:

1. Same window size and the same machine for both runs (viewport size changes the
   visible-cell count and thus the numbers).
2. **New grid:** open `http://localhost:9999/?useNewGrid=1`. **Legacy grid:**
   `http://localhost:9999/?useNewGrid=0`. The param persists the flag and is then
   stripped from the URL.
3. In each: `localStorage.setItem("mock.pagination", "true")`, reload, run any
   query once, inject `gridBench.js`, then run each case and record the row.

The numbers in [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) were collected this
way, driving the running dev server with the Playwright browser.

## Removing the harness (if ever needed)

Delete [`src/scenes/Result/benchmarkMock.ts`](src/scenes/Result/benchmarkMock.ts),
the three `isMockPagination()`-guarded hooks and the two imports in
[`src/scenes/Result/index.tsx`](src/scenes/Result/index.tsx), and
[`e2e/benchmark/`](e2e/benchmark/). `yarn typecheck && yarn lint` should be clean.
