import { withAlpha } from "../../../theme"
import type { ScenePalette } from "./palette"
import { SCENE_MARKUP } from "./sceneMarkup"

// The agent promo's demo: an agent builds an FX dashboard, analyzes a spread
// blowout and sets up an ingestion monitor in the console. It runs on a
// virtual clock, so the promo can jump to a flow and keep playing from there.
// It draws plain DOM and SVG into its root; React only mounts and drives it.

export type Flow = "dashboards" | "analysis" | "monitoring"

export const FLOWS: Flow[] = ["dashboards", "analysis", "monitoring"]

export type Scene = {
  // Jump to the start of a flow and play on from there.
  jump: (flow: Flow) => void
  // Redraw at the root's new size, at the current time.
  relayout: () => void
  // The scene's current time.
  time: () => number
  destroy: () => void
}

export type SceneOptions = {
  // Called when a flow starts, by itself or by a jump.
  onFlow: (flow: Flow) => void
  // Off for reduced motion: a jump shows the end of the flow and stops.
  motion: boolean
  // The console's colours: the charts draw with them.
  palette: ScenePalette
  // Where to start, as a scene time (a redraw in another theme keeps its place).
  startAt?: number
}

type Attrs = Record<string, string | number>
type Point = [number, number]
type Margins = { l: number; r: number; t: number; b: number }
type Plot = {
  svg: SVGGElement
  axes: SVGGElement
  W: number
  H: number
  x0: number
  x1: number
  y0: number
  y1: number
}
type Crosshair = { set: (x: number, label: string) => void; hide: () => void }
type Live = {
  candle: () => number
  spread: () => void
  hour: () => void
  q: {
    c: Plot
    x: (i: number) => number
    mid: number[]
    half: (i: number) => number
  }
  d: { c: Plot; w: number }
  draw: () => void
  md: number[]
  fx: number[]
  drawGap: () => void
  g1: number[]
  g2: number[]
}
type Event = { t: number; seq: number; fn: () => void }

const NS = "http://www.w3.org/2000/svg"
const CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 256 256"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path></svg>'
const CARET_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 256 256"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>'
const TICK = `<span class="ico"><span class="spin"></span><span class="tick">${CHECK}</span></span>`
const FOLLOW_UP = "Ask a follow up question or request refinement..."

// 24h window ending 10:45 UTC; the position of an hour of day on it.
const DAY_TICKS: [number, string][] = [
  [5 / 96, "12:00"],
  [29 / 96, "18:00"],
  [53 / 96, "00:00"],
  [77 / 96, "06:00"],
]
const hourAt = (i: number, perHour: number) => (10.75 + i / perHour) % 24
const session = (h: number) =>
  h >= 22 || h < 6
    ? 0.35
    : h < 7
      ? 0.5
      : h < 8
        ? 1.6
        : h < 12
          ? 1
          : h < 17
            ? 1.3
            : 0.6

// The per-second rows of the event study's grid, T−4s to T+4s. The charts
// read them inside that window, so chart, tooltip and table agree.
const EV_MID: Record<number, number> = {
  [-4]: 1.30212,
  [-3]: 1.30212,
  [-2]: 1.30211,
  [-1]: 1.30213,
  0: 1.30214,
  1: 1.30237,
  2: 1.3026,
  3: 1.3028,
  4: 1.30298,
}
const EV_SPREAD: Record<number, number> = {
  [-4]: 0.5,
  [-3]: 0.5,
  [-2]: 1.3,
  [-1]: 2.6,
  0: 3.2,
  1: 2.4,
  2: 1.6,
  3: 1.1,
  4: 0.8,
}
const EV_DEPTH: Record<number, number> = {
  [-4]: 8,
  [-3]: 8,
  [-2]: 3.5,
  [-1]: 2.3,
  0: 2.1,
  1: 3.0,
  2: 4.5,
  3: 5.9,
  4: 6.9,
}
const evAt = (
  table: Record<number, number>,
  s: number,
  outside: (s: number) => number,
) => {
  if (s < -4 || s > 4) return outside(s)
  const a = Math.floor(s)
  const b = Math.ceil(s)
  return table[a] + (table[b] - table[a]) * (s - a)
}
// Event time, as event studies label it: T is the 07:00:00 release.
const EV_TICKS: [number, string][] = [
  [0, "T−20s"],
  [1 / 3, "T"],
  [1, "T+40s"],
]
const evTime = (s: number) => {
  const t = 7 * 3600 + s
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const sec = ((t % 60) + 60) % 60
  return [h, m, Math.floor(sec)]
    .map((n) => String(n).padStart(2, "0"))
    .join(":")
}
const OPEN_24H = { eur: 1.09221, gbp: 1.30635 }

const PROMPTS = {
  dashboards:
    "Build a dashboard for EURUSD and GBPUSD over the last 24h: 15m candles with VWAP, spreads in pips, volume by hour and a live board by venue.",
  analysis:
    "GBPUSD spread blew out around the UK CPI print this morning. Was liquidity pulled before the release or did it widen on the move?",
  monitoring:
    "Set up an ingestion monitor for market_data and fx_trades: rows/s, WAL lag and freshness. Make it obvious when nothing lands for 30s.",
}

const path = (pts: Point[]) =>
  "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")
const fmt = (v: number, dec: number) =>
  v.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })

export const createScene = (
  root: HTMLElement,
  { onFlow, motion, palette: p, startAt }: SceneOptions,
): Scene => {
  const doc = root.ownerDocument
  const C = {
    up: p.up,
    down: p.down,
    eur: p.eur,
    gbp: p.gbp,
    vwap: p.vwap,
    grid: p.grid,
    warn: p.warning,
    alert: p.danger,
  }
  // Sparkline colour and drift per tile kind.
  const SPARK: Record<string, [string, number]> = {
    up: [p.up, 1],
    down: [p.down, -1],
    eur: [p.eur, 0],
    gbp: [p.eur, 0],
    rate: [p.eur, 0],
    trades: [p.eur, 0],
  }
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  const $ = (name: string): HTMLElement => {
    const node = root.querySelector<HTMLElement>(`[data-el="${name}"]`)
    if (!node) throw new Error(`agent promo scene: no ${name}`)
    return node
  }
  const child = <T extends Element>(node: Element, selector: string): T => {
    const found = node.querySelector<T>(selector)
    if (!found) throw new Error(`agent promo scene: no ${selector}`)
    return found
  }
  const el = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Attrs = {},
  ): SVGElementTagNameMap[K] => {
    const node = doc.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
    return node
  }

  let intervals: ReturnType<typeof setInterval>[] = []
  const every = (ms: number, fn: () => void) => {
    if (motion) intervals.push(setInterval(fn, ms))
  }
  let live = {} as Live

  // ---- Charts, drawn in CSS pixels of their cell so text keeps its size ----

  const canvas = (name: string, m: Margins): Plot => {
    const svg = $(name)
    const wrap = svg.parentElement ?? svg
    const W = wrap.offsetWidth
    const H = wrap.offsetHeight
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`)
    svg.innerHTML = ""
    const axes = el("g")
    const defs = el("defs")
    const clip = el("clipPath", { id: `apd-clip-${name}` })
    const plot = el("g", { "clip-path": `url(#apd-clip-${name})` })
    // ECharts draws a series in from the left: the clip sweeps open.
    clip.appendChild(
      el("rect", { x: 0, y: 0, width: W, height: H, class: "sweep" }),
    )
    defs.appendChild(clip)
    svg.append(defs, axes, plot)
    return {
      svg: plot,
      axes,
      W,
      H,
      x0: m.l,
      x1: W - m.r,
      y0: m.t,
      y1: H - m.b,
    }
  }
  const text = (
    parent: SVGElement,
    x: number,
    y: number,
    str: string,
    anchor = "start",
    fill?: string,
  ) => {
    const t = el("text", { x, y, class: "ax", "text-anchor": anchor })
    if (fill) t.style.fill = fill
    t.textContent = str
    parent.appendChild(t)
    return t
  }
  const yAxis = (
    c: Plot,
    ticks: number[],
    y: (v: number) => number,
    label: (v: number) => string,
  ) => {
    for (const v of ticks) {
      c.axes.appendChild(
        el("line", { x1: c.x0, x2: c.x1, y1: y(v), y2: y(v), stroke: C.grid }),
      )
      text(c.axes, c.x0 - 4, y(v) + 3, label(v), "end")
    }
  }
  const xAxis = (c: Plot, ticks: [number, string][]) => {
    for (const [f, label] of ticks)
      text(
        c.axes,
        c.x0 + f * (c.x1 - c.x0),
        c.H - 3,
        label,
        f < 0.02 ? "start" : f > 0.98 ? "end" : "middle",
      )
  }
  const line = (c: Plot, pts: Point[], color: string, w = 1.4) => {
    const p = el("path", {
      d: path(pts),
      fill: "none",
      stroke: color,
      "stroke-width": w,
      "stroke-linejoin": "round",
    })
    c.svg.appendChild(p)
    return p
  }
  // Marks (events, thresholds) come in after the series, above the clip.
  const markLayer = (c: Plot) => {
    const g = el("g", { class: "mark" })
    c.axes.parentNode?.appendChild(g)
    return g
  }
  const walk = (
    n: number,
    sigma: (i: number) => number,
    start: number,
    end: number,
  ) => {
    const v = [0]
    for (let i = 1; i < n; i++) v.push(v[i - 1] + (rnd() - 0.5) * 2 * sigma(i))
    return v.map(
      (x, i) => start + x - ((v[n - 1] - (end - start)) * i) / (n - 1),
    )
  }
  // Stat tiles draw a sparkline along their bottom, as StatTiles does.
  const sparkline = (svg: SVGElement) => {
    const kind = svg.dataset.spark ?? ""
    svg.innerHTML = ""
    if (!SPARK[kind]) return
    const [color, drift] = SPARK[kind]
    const n = 22
    const v = walk(n, () => 1, 0, drift * 6)
    const lo = Math.min(...v)
    const hi = Math.max(...v)
    const pts = v
      .map(
        (x, i) =>
          `${((i / (n - 1)) * 100).toFixed(1)},${(28 - ((x - lo) / (hi - lo || 1)) * 26).toFixed(1)}`,
      )
      .join(" ")
    const id = `apd-sp-${kind}`
    svg.innerHTML =
      `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
      `<polygon points="0,30 ${pts} 100,30" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`
  }

  const drawCandles = () => {
    const c = canvas("candles", { l: 40, r: 6, t: 6, b: 15 })
    const n = 96
    const closes = walk(
      n + 1,
      (i) =>
        0.00022 *
        session(hourAt(i, 4)) *
        (Math.round(hourAt(i, 4) * 4) === 28 ? 1.5 : 1),
      1.09221,
      1.09352,
    )
    const bars = closes.slice(1).map((cl, i) => {
      const o = closes[i]
      const wick = 0.00012 * session(hourAt(i, 4))
      return {
        o,
        c: cl,
        hi: Math.max(o, cl) + rnd() * wick,
        lo: Math.min(o, cl) - rnd() * wick,
        v: session(hourAt(i, 4)) * (0.8 + rnd() * 0.4),
      }
    })
    const lo = Math.min(...bars.map((b) => b.lo)) - 0.0002
    const hi = Math.max(...bars.map((b) => b.hi)) + 0.0002
    const y = (v: number) => c.y1 - ((v - lo) / (hi - lo)) * (c.y1 - c.y0)
    const w = (c.x1 - c.x0) / n
    const ticks: number[] = []
    for (let v = Math.ceil(lo * 2000) / 2000; v < hi; v += 0.0005) ticks.push(v)
    yAxis(c, ticks, y, (v) => v.toFixed(4))
    xAxis(c, DAY_TICKS)
    let last: SVGGElement | null = null
    bars.forEach((b, i) => {
      const x = c.x0 + i * w + w / 2
      const col = b.c >= b.o ? C.up : C.down
      const g = el("g", { class: "bar", style: `transition-delay:${i * 4}ms` })
      g.append(
        el("line", { x1: x, x2: x, y1: y(b.hi), y2: y(b.lo), stroke: col }),
        el("rect", {
          x: x - w * 0.32,
          y: y(Math.max(b.o, b.c)),
          width: w * 0.64,
          height: Math.max(1, Math.abs(y(b.c) - y(b.o))),
          fill: col,
        }),
      )
      c.svg.appendChild(g)
      last = g
    })
    const lastBar = bars[n - 1]
    const lastG = last as SVGGElement | null
    // The forming candle moves with every refresh.
    live.candle = () => {
      lastBar.c += (rnd() - 0.48) * 0.00006
      lastBar.hi = Math.max(lastBar.hi, lastBar.c)
      lastBar.lo = Math.min(lastBar.lo, lastBar.c)
      const [wick, body] = lastG ? Array.from(lastG.children) : []
      if (wick && body) {
        const col = lastBar.c >= lastBar.o ? C.up : C.down
        wick.setAttribute("y1", String(y(lastBar.hi)))
        wick.setAttribute("y2", String(y(lastBar.lo)))
        wick.setAttribute("stroke", col)
        body.setAttribute("y", String(y(Math.max(lastBar.o, lastBar.c))))
        body.setAttribute(
          "height",
          String(Math.max(1, Math.abs(y(lastBar.c) - y(lastBar.o)))),
        )
        body.setAttribute("fill", col)
      }
      return lastBar.c
    }
    // An anchored VWAP over the window.
    let pv = 0
    let vol = 0
    const vwap: Point[] = bars.map((b, i) => {
      pv += ((b.hi + b.lo + b.c) / 3) * b.v
      vol += b.v
      return [c.x0 + i * w + w / 2, y(pv / vol)]
    })
    line(c, vwap, C.vwap, 1.3)
  }

  // Top-of-book spread in pips, 10m buckets: wider in Asia, and GBPUSD blows
  // out at the UK CPI print.
  const drawSpread = () => {
    const c = canvas("spread", { l: 16, r: 6, t: 6, b: 15 })
    const n = 144
    const y = (v: number) => c.y1 - (v / 3.6) * (c.y1 - c.y0)
    const w = (c.x1 - c.x0) / (n - 1)
    yAxis(c, [0, 1, 2, 3], y, String)
    xAxis(c, [
      [5 / 96, "12:00"],
      [53 / 96, "00:00"],
    ])
    const asia = (i: number) => {
      const h = hourAt(i, 6)
      return h >= 21 || h < 6 ? 1.6 : 1
    }
    const spike = (i: number) => Math.exp(-Math.pow((i - 121.5) / 0.9, 2))
    const se = Array.from(
      { length: n },
      (_, i) => 0.18 * asia(i) + (rnd() - 0.5) * 0.05 + spike(i) * 0.45,
    )
    const sg = Array.from(
      { length: n },
      (_, i) => 0.48 * asia(i) + (rnd() - 0.5) * 0.1 + spike(i) * 2.7,
    )
    const le = line(c, [[0, 0]], C.eur, 1.2)
    const lg = line(c, [[0, 0]], C.gbp, 1.3)
    const draw = () => {
      le.setAttribute("d", path(se.map((v, i) => [c.x0 + i * w, y(v)])))
      lg.setAttribute("d", path(sg.map((v, i) => [c.x0 + i * w, y(v)])))
    }
    draw()
    live.spread = () => {
      se[n - 1] = 0.16 + rnd() * 0.08
      sg[n - 1] = 0.42 + rnd() * 0.16
      draw()
    }
  }

  // Notional by hour, stacked: quiet Asia, the London open with the CPI
  // print, the London/New York overlap. This hour's bar grows as trades land.
  const drawVolume = () => {
    const c = canvas("vol", { l: 16, r: 6, t: 6, b: 15 })
    const n = 24
    const y = (v: number) => c.y1 - (v / 11) * (c.y1 - c.y0)
    const w = (c.x1 - c.x0) / n
    yAxis(c, [0, 5, 10], y, String)
    xAxis(c, [
      [1.25 / 24, "12:00"],
      [13.25 / 24, "00:00"],
    ])
    for (let i = 0; i < n; i++) {
      const f = session((11 + i) % 24) * (0.9 + rnd() * 0.2)
      const e = 4 * f
      const g = 2.6 * f
      const x = c.x0 + i * w + w * 0.15
      const grp = el("g", {
        class: "bar",
        style: `transition-delay:${i * 15}ms`,
      })
      const re = el("rect", {
        x,
        width: w * 0.7,
        fill: C.eur,
        "fill-opacity": 0.7,
      })
      const rg = el("rect", {
        x,
        width: w * 0.7,
        fill: C.gbp,
        "fill-opacity": 0.8,
      })
      grp.append(re, rg)
      c.svg.appendChild(grp)
      let ee = i === n - 1 ? e * 0.55 : e
      let gg = i === n - 1 ? g * 0.55 : g
      const put = () => {
        re.setAttribute("y", String(y(ee)))
        re.setAttribute("height", String(y(0) - y(ee)))
        rg.setAttribute("y", String(y(ee + gg)))
        rg.setAttribute("height", String(y(ee) - y(ee + gg)))
      }
      put()
      if (i === n - 1)
        live.hour = () => {
          ee += 0.045 + rnd() * 0.025
          gg += 0.03 + rnd() * 0.02
          put()
        }
    }
  }

  const evMark = (c: Plot, x0: number, x1: number | null, label: string) => {
    const mk = markLayer(c)
    if (x1 !== null)
      mk.appendChild(
        el("rect", {
          x: x0,
          y: c.y0,
          width: x1 - x0,
          height: c.y1 - c.y0,
          fill: withAlpha(p.warning, 0.14),
        }),
      )
    else
      mk.appendChild(
        el("line", {
          x1: x0,
          x2: x0,
          y1: c.y0,
          y2: c.y1,
          stroke: C.warn,
          "stroke-dasharray": "3 3",
        }),
      )
    text(
      mk,
      x1 !== null ? (x0 + x1) / 2 : x0,
      c.y0 - 4,
      label,
      "middle",
      C.warn,
    )
  }

  // Event study, 06:59:40–07:00:40: a neutral bid/ask band with mid.
  const drawQuote = () => {
    const c = canvas("quote", { l: 36, r: 8, t: 14, b: 15 })
    const n = 121
    const at = (i: number) => i / 2 - 20
    const mid = Array.from({ length: n }, (_, i) => {
      const s = at(i)
      if (Number.isInteger(s) && EV_MID[s] !== undefined) return EV_MID[s]
      return (
        1.30212 +
        (s < -4 ? (rnd() - 0.5) * 0.00003 : 0) +
        (s > 0 ? 0.0024 * (1 - Math.exp(-s / 9)) : 0)
      )
    })
    const half = (i: number) =>
      (evAt(EV_SPREAD, at(i), (s) =>
        s < -4 ? 0.5 : 0.5 + 0.3 * Math.exp(-(s - 4) / 4),
      ) /
        2) *
      0.0001
    const lo = 1.3017
    const hi = 1.305
    const y = (v: number) => c.y1 - ((v - lo) / (hi - lo)) * (c.y1 - c.y0)
    const x = (i: number) => c.x0 + (i / (n - 1)) * (c.x1 - c.x0)
    yAxis(c, [1.302, 1.303, 1.304, 1.305], y, (v) => v.toFixed(4))
    xAxis(c, EV_TICKS)
    const bid: Point[] = mid.map((m, i) => [x(i), y(m - half(i))])
    const ask: Point[] = mid.map((m, i) => [x(i), y(m + half(i))])
    c.svg.appendChild(
      el("path", {
        d:
          path(ask) +
          " L" +
          bid
            .slice()
            .reverse()
            .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
            .join(" L") +
          " Z",
        fill: withAlpha(p.secondary, 0.38),
      }),
    )
    line(
      c,
      mid.map((m, i) => [x(i), y(m)]),
      p.primary,
      1.2,
    )
    evMark(c, x(40), null, "UK CPI")
    live.q = { c, x, mid, half }
  }

  // Top-of-book size per second, order-book style: asks up, bids down.
  const drawDepth = () => {
    const c = canvas("depth", { l: 22, r: 8, t: 14, b: 15 })
    const n = 60
    const w = (c.x1 - c.x0) / n
    const size = (s: number) =>
      evAt(EV_DEPTH, s, (s) =>
        s < -4 ? 8 : 6.9 + 1.1 * (1 - Math.exp(-(s - 4) / 6)),
      ) / 2
    const y = (v: number) => (c.y0 + c.y1) / 2 - (v / 5) * ((c.y1 - c.y0) / 2)
    for (const v of [-4, 0, 4]) {
      c.axes.appendChild(
        el("line", {
          x1: c.x0,
          x2: c.x1,
          y1: y(v),
          y2: y(v),
          stroke: v ? C.grid : withAlpha(p.secondary, 0.3),
        }),
      )
      text(c.axes, c.x0 - 4, y(v) + 3, String(Math.abs(v)), "end")
    }
    xAxis(c, EV_TICKS)
    for (let i = 0; i < n; i++) {
      const s = i - 20
      const a = size(s) * (0.9 + rnd() * 0.2)
      const b = size(s) * (0.9 + rnd() * 0.2)
      const x = c.x0 + i * w + w * 0.15
      const g = el("g", {
        class: "bar",
        style: `transform-origin: center; transition-delay:${i * 6}ms`,
      })
      g.append(
        el("rect", {
          x,
          y: y(a),
          width: w * 0.7,
          height: y(0) - y(a),
          fill: C.down,
          "fill-opacity": 0.75,
        }),
        el("rect", {
          x,
          y: y(0),
          width: w * 0.7,
          height: y(-b) - y(0),
          fill: C.up,
          "fill-opacity": 0.75,
        }),
      )
      c.svg.appendChild(g)
    }
    evMark(c, c.x0 + 18 * w, c.x0 + 20 * w, "Depth −72%")
    live.d = { c, w }
  }

  // Ingestion health: rows/s for both feeds (fx_trades on the right axis,
  // with a stall 9 minutes ago), and the max gap with its 30 s threshold.
  const drawIngestion = () => {
    const rate = canvas("ingest", { l: 22, r: 22, t: 6, b: 15 })
    const n = 180
    const stall = (i: number) => i >= 72 && i < 80
    const md = Array.from(
      { length: n },
      (_, i) => 1970 + Math.sin(i / 11) * 110 + (rnd() - 0.5) * 180,
    )
    const fx = Array.from({ length: n }, (_, i) =>
      stall(i) ? 0 : 60 + Math.sin(i / 8) * 8 + (rnd() - 0.5) * 14,
    )
    const y = (v: number) => rate.y1 - (v / 3000) * (rate.y1 - rate.y0)
    const y2 = (v: number) => rate.y1 - (v / 200) * (rate.y1 - rate.y0)
    yAxis(rate, [0, 1000, 2000, 3000], y, (v) => (v ? `${v / 1000}K` : "0"))
    xAxis(rate, [
      [0, "−15m"],
      [1 / 3, "−10m"],
      [2 / 3, "−5m"],
      [1, "now"],
    ])
    for (const v of [0, 100, 200])
      text(rate.axes, rate.x1 + 4, y2(v) + 3, String(v))
    const area = el("path", { fill: withAlpha(p.eur, 0.1) })
    const s1 = el("path", { fill: "none", stroke: C.eur, "stroke-width": 1.3 })
    const s2 = el("path", { fill: "none", stroke: C.gbp, "stroke-width": 1.3 })
    rate.svg.append(area, s1, s2)
    const X = (i: number) => rate.x0 + (i / (n - 1)) * (rate.x1 - rate.x0)
    live.draw = () => {
      const p1: Point[] = md.map((v, i) => [X(i), y(v)])
      s1.setAttribute("d", path(p1))
      area.setAttribute(
        "d",
        `${path(p1)} L${rate.x1},${rate.y1} L${rate.x0},${rate.y1} Z`,
      )
      s2.setAttribute("d", path(fx.map((v, i) => [X(i), y2(v)])))
    }
    live.md = md
    live.fx = fx
    live.draw()

    const gap = canvas("gap", { l: 16, r: 6, t: 8, b: 15 })
    const m = 90
    const yg = (v: number) => gap.y1 - (v / 40) * (gap.y1 - gap.y0)
    yAxis(gap, [0, 10, 20, 30, 40], yg, String)
    xAxis(gap, [
      [0, "−15m"],
      [1, "now"],
    ])
    const g1 = Array.from({ length: m }, () => 0.3 + rnd() * 0.6)
    const g2 = Array.from({ length: m }, (_, i) =>
      i === 36 ? 38 : i === 37 ? 12 : 1 + rnd() * 2.2,
    )
    const l1 = line(gap, [[0, 0]], C.eur, 1.2)
    const l2 = line(gap, [[0, 0]], C.gbp, 1.2)
    const GX = (i: number) => gap.x0 + (i / (m - 1)) * (gap.x1 - gap.x0)
    live.drawGap = () => {
      l1.setAttribute("d", path(g1.map((g, i) => [GX(i), yg(g)])))
      l2.setAttribute("d", path(g2.map((g, i) => [GX(i), yg(g)])))
    }
    live.g1 = g1
    live.g2 = g2
    live.drawGap()
    const th = markLayer(gap)
    th.appendChild(
      el("line", {
        x1: gap.x0,
        x2: gap.x1,
        y1: yg(30),
        y2: yg(30),
        stroke: C.alert,
        "stroke-dasharray": "4 3",
      }),
    )
    text(th, gap.x1 - 2, yg(30) - 4, "30 s", "end", C.alert)
  }

  const build = () => {
    seed = 11
    live = {} as Live
    root.querySelectorAll<SVGElement>(".spark").forEach((svg) => sparkline(svg))
    drawCandles()
    drawSpread()
    drawVolume()
    drawQuote()
    drawDepth()
    drawIngestion()
  }

  // ---- Clock: events run on a virtual time line so the player can jump ----

  let events: Event[] = []
  let now = 0
  let seq = 0
  // Relative to the event being run, as setTimeout would be.
  const at = (ms: number, fn: () => void) => {
    events.push({ t: now + ms, seq: seq++, fn })
  }
  const runUntil = (time: number) => {
    for (;;) {
      let next: Event | null = null
      for (const e of events)
        if (
          e.t <= time &&
          (!next || e.t < next.t || (e.t === next.t && e.seq < next.seq))
        )
          next = e
      if (!next) break
      events.splice(events.indexOf(next), 1)
      now = next.t
      next.fn()
    }
    now = time
  }

  // ---- The AI Assistant panel ----

  const add = (html: string, cls: string) => {
    const d = doc.createElement("div")
    d.className = `${cls} pop`
    d.innerHTML = html
    const chat = $("chat")
    chat.appendChild(d)
    while (chat.scrollHeight > chat.clientHeight && chat.children.length > 1)
      chat.firstChild?.remove()
    return d
  }
  const typeInto = (start: number, prompt: string, speed = 8) => {
    at(start, () => {
      $("box").classList.add("focus")
      $("send").classList.remove("off")
    })
    for (let i = 1; i <= prompt.length; i++)
      at(start + i * speed, () => {
        $("box").innerHTML = `${prompt.slice(0, i)}<span class="caret"></span>`
      })
    return start + prompt.length * speed
  }
  const send = (ms: number, prompt: string) =>
    at(ms, () => {
      add(prompt, "user")
      $("box").classList.remove("focus")
      $("send").classList.add("off")
      $("ai").classList.add("busy")
      $("box").innerHTML = `<span class="ph">${FOLLOW_UP}</span>`
      const title = $("aiTitle")
      if (title.textContent === "AI Assistant") title.textContent = prompt
    })
  // Running steps under a shimmering title, then folded into "Worked for
  // Ns", as the chat does.
  const steps = (start: number, labels: string[], gap = 330) => {
    let group: HTMLDivElement | null = null
    at(start, () => {
      group = add(
        '<div class="work-head"><span class="ico"><span class="spin"></span></span><span class="shimmer" data-t>Working…</span></div><div class="work-steps"></div>',
        "work",
      )
    })
    labels.forEach((label, i) => {
      let node: HTMLDivElement | null = null
      at(start + i * gap, () => {
        if (!group) return
        node = doc.createElement("div")
        node.className = "step pop"
        node.innerHTML = `${TICK}<span>${label}</span>`
        child(group, ".work-steps").appendChild(node)
        child(group, "[data-t]").textContent = label
      })
      at(start + (i + 1) * gap - 60, () => node?.classList.add("done"))
    })
    at(start + labels.length * gap, () => {
      if (!group) return
      const secs = Math.max(2, Math.round(labels.length * 1.7))
      group.innerHTML = `<div class="work-head"><span class="ico tick" style="display:flex">${CHECK}</span><span>Worked for ${secs}s</span><span class="caret-r">${CARET_RIGHT}</span></div>`
      $("ai").classList.remove("busy")
    })
  }

  // ---- Notebook helpers ----

  // Stat values roll up to their value when the tile appears (animateDigits).
  const countUp = (node: HTMLElement) => {
    const to = Number(node.dataset.count)
    const dec = Number(node.dataset.dec)
    const from = dec >= 4 ? to * 0.997 : 0
    for (let k = 0; k <= 14; k++)
      at(k * 45, () => {
        const e = 1 - Math.pow(1 - k / 14, 3)
        node.textContent = fmt(from + (to - from) * e, dec)
      })
  }
  const show = (name: string, delay: number) =>
    at(delay, () => {
      const cell = $(name)
      cell.classList.add("in")
      cell
        .querySelectorAll<HTMLElement>("[data-count]")
        .forEach((node) => countUp(node))
      at(700, () => cell.classList.add("settled"))
    })
  const restart = (node: HTMLElement, cls: string) => {
    node.classList.remove("flash-up", "flash-down")
    void node.offsetWidth
    node.classList.add(cls)
  }
  const flash = (node: HTMLElement, value: string, dir: number) => {
    node.textContent = value
    restart(node, dir > 0 ? "flash-up" : "flash-down")
  }
  // A grid cell flashes green or red against the previous refresh and keeps
  // its direction glyph (the "previous" highlight rule).
  const cellFlash = (td: HTMLElement, dir: number) => {
    const odd = td.dataset.p === "1"
    td.dataset.p = odd ? "0" : "1"
    td.classList.remove("fl-up", "fl-down", "fl-up2", "fl-down2")
    td.classList.add((dir > 0 ? "fl-up" : "fl-down") + (odd ? "2" : ""))
    const g = child<HTMLElement>(td, ".g")
    g.className = `g ${dir > 0 ? "up" : "down"}`
    g.textContent = dir > 0 ? "▲" : "▼"
  }
  const venueTick = (eur: number, gbp: number) => {
    // Three venues per pair: rows 0–2 are EURUSD, 4–6 GBPUSD.
    for (const i of [0, 1, 2, 4, 5, 6]) {
      const row = $(`vr${i}`)
      if (rnd() < 0.45) continue
      const px = child<HTMLElement>(row, ".px")
      const prev = Number(px.textContent)
      const base = i < 3 ? eur : gbp
      const next = Number(
        (base + Math.round((rnd() - 0.5) * 2.4) * 0.00001).toFixed(5),
      )
      if (next !== prev && px.parentElement) {
        px.textContent = next.toFixed(5)
        cellFlash(px.parentElement, next - prev)
      }
      const vol = child<HTMLElement>(row, ".vol")
      const v = Number((vol.textContent ?? "$0M").slice(1, -1)) + rnd() * 0.3
      vol.textContent = `$${v.toFixed(1)}M`
      child<HTMLElement>(row, ".db").style.width =
        `${Math.min(100, (v / 20) * 100)}%`
      const tr = child<HTMLElement>(row, ".tr")
      tr.textContent = String(
        Number(tr.textContent) + 1 + Math.floor(rnd() * 3),
      )
    }
  }
  // The 24h change follows the price: the arrow by its sign.
  const change = (node: HTMLElement, px: number, open: number) => {
    const pct = (px / open - 1) * 100
    node.textContent = `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(pct).toFixed(3)}%`
    node.style.color = pct >= 0 ? p.positive : p.negative
  }
  const VIEWS: [string, string][] = [
    ["tab1", "dash"],
    ["tab2", "ana"],
    ["tab3", "mon"],
  ]
  const openView = (k: number, title: string) => {
    VIEWS.forEach(([tab, pane], i) => {
      if (i === k) $(tab).classList.remove("hidden")
      $(tab).classList.toggle("active", i === k)
      $(pane).classList.toggle("off", i !== k)
    })
    $("nbTitle").textContent = title
    $("live").style.display = k === 1 ? "none" : "flex"
  }

  // Linked time charts share the crosshair: the line and its axis label
  // follow the pointer on both.
  const crosshair = (c: Plot): Crosshair => {
    const g = el("g", { style: "display:none" })
    c.axes.parentNode?.appendChild(g)
    const ln = el("line", {
      y1: c.y0,
      y2: c.y1,
      stroke: withAlpha(p.primary, 0.55),
      "stroke-width": 1,
    })
    const box = el("rect", {
      y: c.y1 + 1,
      width: 40,
      height: 12,
      rx: 2,
      fill: p.crossBox,
    })
    const lab = el("text", {
      y: c.y1 + 10,
      class: "ax",
      "text-anchor": "middle",
    })
    lab.style.fill = p.crossText
    g.append(ln, box, lab)
    return {
      set: (x, label) => {
        g.style.display = ""
        ln.setAttribute("x1", String(x))
        ln.setAttribute("x2", String(x))
        box.setAttribute("x", String(x - 20))
        lab.setAttribute("x", String(x))
        lab.textContent = label
      },
      hide: () => {
        g.style.display = "none"
      },
    }
  }
  // A pointer explores the study with the shared crosshair: it sweeps back
  // from T+18s, rests on T−2s, then leaves.
  const explore = (start: number) => {
    let xq: Crosshair | null = null
    let xd: Crosshair | null = null
    at(start, () => {
      xq = crosshair(live.q.c)
      xd = crosshair(live.d.c)
      $("cur").style.display = "block"
    })
    const count = 32
    const from = 18
    const to = -2
    for (let k = 0; k <= count; k++)
      at(start + 60 + k * 34, () => {
        const e = k / count
        const f = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2
        const sec = from + (to - from) * f
        const { c, x, mid, half } = live.q
        const i = Math.round((sec + 20) * 2)
        const px = x(i)
        const py = c.y0 + (c.y1 - c.y0) * (0.34 + 0.08 * Math.sin(k / 5))
        const cur = $("cur")
        cur.style.left = `${(px / c.W) * 100}%`
        cur.style.top = `${(py / c.H) * 100}%`
        const label = evTime(Math.round(sec))
        xq?.set(px, label)
        xd?.set(
          live.d.c.x0 + (Math.round(sec) + 20) * live.d.w + live.d.w / 2,
          label,
        )
        const tip = $("tip")
        tip.style.display = "block"
        tip.innerHTML = `<b>${label}</b><br><i style="background:${p.primary}"></i>Mid <b>${mid[i].toFixed(5)}</b><br><i style="background:${p.secondary}"></i>Spread <b>${(half(i) * 2e4).toFixed(1)}</b> pips`
        const onLeft = px / c.W > 0.55
        tip.style.left = onLeft ? "" : `${((px + 12) / c.W) * 100}%`
        tip.style.right = onLeft ? `${((c.W - px + 12) / c.W) * 100}%` : ""
        tip.style.top = `${((py + 14) / c.H) * 100}%`
      })
    at(start + 60 + count * 34 + 1100, () => {
      $("cur").style.display = "none"
      $("tip").style.display = "none"
      xq?.hide()
      xd?.hide()
    })
  }

  // ---- The three flows ----

  const flowStart: Record<Flow, number> = {
    dashboards: 0,
    analysis: 0,
    monitoring: 0,
  }
  const flowEnd: Record<Flow, number> = {
    dashboards: 0,
    analysis: 0,
    monitoring: 0,
  }
  const script = () => {
    // 1. Build dashboards: a quant's view of the majors.
    at(100, () => onFlow("dashboards"))
    const t = typeInto(200, PROMPTS.dashboards)
    send(t + 120, PROMPTS.dashboards)
    steps(t + 300, [
      "Read the fx_trades and market_data schemas",
      "Wrote and checked 5 queries",
      "Built FX majors · 24h",
    ])
    ;["k1", "c1", "c3", "c4", "c2"].forEach((name, i) =>
      show(name, t + 700 + i * 120),
    )
    at(t + 1250, () => {
      $("tab1Name").textContent = "FX majors · 24h"
      $("nbTitle").textContent = "FX majors · 24h"
      $("live").style.display = "flex"
    })
    // The dashboard refreshes every 500ms: the forming candle, the prices,
    // the venue board, this hour's volume and the spread move.
    at(t + 1700, () => {
      let gbp = 1.30361
      every(500, () => {
        const eurPx = $("eurPx")
        const prev = Number(eurPx.textContent)
        const eur = live.candle()
        if (eur.toFixed(5) !== prev.toFixed(5))
          flash(eurPx, eur.toFixed(5), eur - prev)
        const d = Math.round((rnd() - 0.5) * 3) * 0.00001
        gbp += d
        if (d) flash($("gbpPx"), gbp.toFixed(5), d)
        change($("eurChg"), eur, OPEN_24H.eur)
        change($("gbpChg"), gbp, OPEN_24H.gbp)
        venueTick(eur, gbp)
        live.hour()
        live.spread()
      })
    })
    at(t + 1350, () =>
      add(
        "Done: <b>FX majors · 24h</b> has 15m candles with VWAP, spreads, hourly volume and a live venue board. It refreshes every 500ms.",
        "reply",
      ),
    )

    // 2. Analyze data: the spike on that dashboard, as an event study.
    const t2 = t + 2900
    flowEnd.dashboards = t2 - 200
    flowStart.analysis = t2
    at(t2, () => onFlow("analysis"))
    const u = typeInto(t2 + 80, PROMPTS.analysis)
    send(u + 120, PROMPTS.analysis)
    steps(u + 300, [
      "Found the spike in market_data at 07:00 UTC",
      "Joined quotes and fx_trades per second",
      "Built GBPUSD · UK CPI",
    ])
    at(u + 700, () => openView(1, "GBPUSD · UK CPI"))
    ;["a1", "a2", "a3", "a4"].forEach((name, i) =>
      show(name, u + 760 + i * 130),
    )
    at(u + 1350, () =>
      add(
        "Liquidity was pulled first: top-of-book depth fell <b>72%</b> in the 2s before 07:00:00 UTC while mid held flat, and the spread went from <b>0.5 to 3.2 pips</b>. Price moved only after the print. Details are in <b>GBPUSD · UK CPI</b>.",
        "reply",
      ),
    )
    flowEnd.analysis = u + 1450
    explore(u + 1500)

    // 3. Monitor your instance: an SRE's ingestion health check.
    const t3 = u + 4000
    flowStart.monitoring = t3
    at(t3, () => onFlow("monitoring"))
    const v = typeInto(t3 + 80, PROMPTS.monitoring)
    send(v + 120, PROMPTS.monitoring)
    steps(v + 300, [
      "Checked wal_tables() for both tables",
      "Measured rows/s and gaps over the last 15m",
      "Built Ingestion health",
    ])
    at(v + 700, () => {
      openView(2, "Ingestion health")
      let k = 0
      every(500, () => {
        k += 1
        live.md.shift()
        live.md.push(
          1970 + Math.sin((180 + k) / 11) * 110 + (rnd() - 0.5) * 180,
        )
        live.fx.shift()
        live.fx.push(60 + Math.sin((180 + k) / 8) * 8 + (rnd() - 0.5) * 14)
        live.draw()
        live.g1.shift()
        live.g1.push(0.3 + rnd() * 0.6)
        live.g2.shift()
        live.g2.push(1 + rnd() * 2.2)
        live.drawGap()
        $("rate").textContent = Math.round(
          live.md[live.md.length - 1],
        ).toLocaleString("en-US")
        $("rate2").textContent = String(Math.round(live.fx[live.fx.length - 1]))
        $("fresh").textContent = `${(0.1 + rnd() * 0.4).toFixed(1)} s`
      })
    })
    ;["m1", "m4", "m5", "m6"].forEach((name, i) =>
      show(name, v + 760 + i * 120),
    )
    at(v + 1350, () =>
      add(
        "<b>Ingestion health</b> refreshes every 500ms. Both feeds are up and the WAL is applied. fx_trades stalled for 38s at 10:31 UTC and recovered on its own. Freshness turns red when a feed goes 30s without rows.",
        "reply",
      ),
    )
    flowEnd.monitoring = v + 2200
    return v + 4300
  }

  // ---- Player: autoplays, loops, and jumps to a flow on request ----

  let duration = 0
  let origin = 0
  let frame = 0
  let paused = !motion
  const reset = () => {
    for (const id of intervals) clearInterval(id)
    intervals = []
    root.innerHTML = SCENE_MARKUP
    build()
    events = []
    now = 0
    seq = 0
    duration = script()
  }
  const seek = (time: number) => {
    reset()
    root.classList.add("instant")
    runUntil(time)
    void root.offsetHeight
    // Without motion the scene stays still: no transitions or animations.
    if (motion) root.classList.remove("instant")
    origin = performance.now() - time
  }
  const tick = () => {
    const time = performance.now() - origin
    if (time >= duration) seek(0)
    else runUntil(time)
    frame = requestAnimationFrame(tick)
  }

  if (motion) {
    seek(startAt ?? 0)
    frame = requestAnimationFrame(tick)
  } else {
    // The flows' times are known once the script has been laid out.
    reset()
    seek(flowEnd.dashboards)
  }

  return {
    jump: (flow) => {
      if (motion) seek(flowStart[flow])
      else {
        seek(flowEnd[flow])
        onFlow(flow)
      }
    },
    relayout: () => {
      seek(paused ? now : performance.now() - origin)
    },
    time: () => (paused ? now : performance.now() - origin),
    destroy: () => {
      paused = true
      cancelAnimationFrame(frame)
      for (const id of intervals) clearInterval(id)
      intervals = []
      root.innerHTML = ""
    },
  }
}
