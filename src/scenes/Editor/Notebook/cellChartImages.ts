import type { EChartsType } from "echarts"

// The ECharts instance each drawn cell shows, so an agent can ask for a
// picture of it (get_cell_image). Only cells on screen have one: a notebook
// that is not open, or a cell scrolled away, draws nothing.

const instances = new Map<string, EChartsType>()

const keyOf = (bufferId: number, cellId: string) => `${bufferId}:${cellId}`

/** Registers a cell's chart; the returned function unregisters it. */
export const registerCellChart = (
  bufferId: number,
  cellId: string,
  instance: EChartsType,
): (() => void) => {
  const key = keyOf(bufferId, cellId)
  instances.set(key, instance)
  return () => {
    if (instances.get(key) === instance) instances.delete(key)
  }
}

export const cellChartInstance = (
  bufferId: number,
  cellId: string,
): EChartsType | null => {
  const instance = instances.get(keyOf(bufferId, cellId))
  return instance && !instance.isDisposed() ? instance : null
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error("aborted"))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })

/** Waits up to `timeoutMs` for a cell's chart to be drawn. */
export const waitForCellChart = async (
  bufferId: number,
  cellId: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<EChartsType | null> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const instance = cellChartInstance(bufferId, cellId)
    if (instance || Date.now() >= deadline) return instance
    await sleep(100, signal)
  }
}

// Agents read pictures, not pixels: 1600 px on the longest side is plenty.
const MAX_PICTURE_SIDE = 1600
// The bridge takes 4 MB per message; leave room for the text beside it.
const MAX_PICTURE_BASE64 = 3_000_000

export type CellChartPicture = {
  // Base64 PNG, without the data: prefix.
  data: string
  width: number
  height: number
}

/**
 * A PNG of a chart as drawn, on `background`, at most 1600 px on its longest
 * side. A picture too large to send is drawn again at half the size, once;
 * null when even that is too large.
 */
export const pictureOf = (
  instance: EChartsType,
  background: string,
): CellChartPicture | null => {
  const width = instance.getWidth()
  const height = instance.getHeight()
  const first = Math.min(2, MAX_PICTURE_SIDE / Math.max(width, height, 1))
  for (const pixelRatio of [first, first / 2]) {
    const url = instance.getDataURL({
      type: "png",
      pixelRatio,
      backgroundColor: background,
    })
    const data = url.slice(url.indexOf(",") + 1)
    if (data.length <= MAX_PICTURE_BASE64)
      return {
        data,
        width: Math.round(width * pixelRatio),
        height: Math.round(height * pixelRatio),
      }
  }
  return null
}

/**
 * Resolves once a chart that just mounted has finished drawing in (its entry
 * animation), or after `timeoutMs`.
 */
export const settled = (
  instance: EChartsType,
  timeoutMs = 1500,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      instance.off("finished", done)
      signal?.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    instance.on("finished", done)
    signal?.addEventListener("abort", done, { once: true })
  })

/** The nearest ancestor that scrolls vertically. */
const scrollerOf = (node: Element): Element | null => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (/(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight)
      return el
  }
  return null
}

/**
 * Scrolls a notebook cell into view; returns a function that puts the scroll
 * back where the user had it.
 */
export const bringCellIntoView = (cellId: string): (() => void) => {
  const node = document.querySelector(
    `[data-notebook-cell][data-cell-id="${CSS.escape(cellId)}"]`,
  )
  if (!node) return () => undefined
  const scroller = scrollerOf(node)
  const top = scroller?.scrollTop
  node.scrollIntoView({ block: "nearest" })
  const landed = scroller?.scrollTop
  return () => {
    // Unless the user has scrolled since: then their scroll stands.
    if (scroller && top !== undefined && scroller.scrollTop === landed)
      scroller.scrollTop = top
  }
}

const isOpaque = (color: string) =>
  color !== "" && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)

/** The colour a cell is drawn on: the first opaque background up the tree. */
export const backgroundOf = (node: Element | null): string => {
  for (let el = node; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor
    if (isOpaque(color)) return color
  }
  return getComputedStyle(document.body).backgroundColor
}
