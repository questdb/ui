// Shared by the jsdom chart tests that draw cells through DrawCanvas with a
// real ECharts: a sized layout, a canvas that only measures text, result
// builders and a reader for the instance a host element shows.
import type { EChartsType } from "echarts"
import { vi } from "vitest"
import type { CellResult } from "../../../../store/notebook"
import { echarts } from "../CellChart/echartsSetup"

export const stubChartLayout = (width = 700, height = 400) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, width, height),
  )
  for (const [property, size] of [
    ["clientWidth", width],
    ["clientHeight", height],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockReturnValue(size)
  }
  // jsdom has no Canvas2D: drawing is a no-op and text has a fixed width.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return new Proxy(
        {
          canvas: this,
          measureText: (text: string) => ({ width: text.length * 7 }),
          createLinearGradient: () => ({ addColorStop: () => undefined }),
          createRadialGradient: () => ({ addColorStop: () => undefined }),
        },
        {
          get: (target, key): unknown =>
            (Reflect.get(target, key) as unknown) ?? (() => undefined),
        },
      ) as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  )
}

export type Column = { name: string; type: string }

export type Statement = { query: string; columns: Column[]; rows: unknown[][] }

/** A settled cell result, one DQL result per statement. */
export const resultOf = (statements: Statement[], timestamp = 1): CellResult =>
  ({
    activeResultIndex: 0,
    timestamp,
    results: statements.map(({ query, columns, rows }) => ({
      type: "dql",
      query,
      columns,
      dataset: rows,
      count: rows.length,
      timestamp: 0,
    })),
  }) as unknown as CellResult

export const sqlOf = (statements: Statement[]) =>
  statements.map(({ query }) => query).join(";\n")

/** The live ECharts instance drawn inside `root`, if any. */
export const instanceIn = (root: ParentNode): EChartsType | undefined => {
  const host = root.querySelector<HTMLElement>("[_echarts_instance_]")
  const instance = host ? echarts.getInstanceByDom(host) : undefined
  return instance && !instance.isDisposed() ? instance : undefined
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))
