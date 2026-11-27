// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { darkTheme, lightTheme } from "../../../theme"
import { createQuestdbTheme } from "../../../scenes/Editor/Notebook/CellChart/questdbTheme"
import { scenePaletteOf } from "./palette"
import { createScene, type Flow } from "./scene"

const textOf = (root: HTMLElement, name: string) =>
  root.querySelector(`[data-el="${name}"]`)?.textContent

describe("the agent promo's demo scene", () => {
  it("without motion, shows the end of each flow it jumps to", () => {
    // Given a still scene
    const root = document.createElement("div")
    const flows: Flow[] = []
    const scene = createScene(root, {
      onFlow: (flow) => flows.push(flow),
      motion: false,
      palette: scenePaletteOf(darkTheme),
    })

    // Then it shows the dashboard the agent built
    expect(textOf(root, "nbTitle")).toBe("FX majors · 24h")
    expect(flows.at(-1)).toBe("dashboards")

    // When it jumps to the analysis, then to monitoring
    scene.jump("analysis")
    expect(textOf(root, "nbTitle")).toBe("GBPUSD · UK CPI")
    expect(flows.at(-1)).toBe("analysis")
    scene.jump("monitoring")

    // Then it shows the monitor, still
    expect(textOf(root, "nbTitle")).toBe("Ingestion health")
    expect(flows.at(-1)).toBe("monitoring")
    expect(root.classList.contains("instant")).toBe(true)

    // When it is taken down
    scene.destroy()

    // Then it leaves nothing behind
    expect(root.innerHTML).toBe("")
  })

  it("plays on a clock, and stops it when taken down", () => {
    // Given a playing scene
    const frame = vi.spyOn(window, "requestAnimationFrame")
    const cancel = vi.spyOn(window, "cancelAnimationFrame")
    const root = document.createElement("div")
    const scene = createScene(root, {
      onFlow: () => undefined,
      motion: true,
      palette: scenePaletteOf(darkTheme),
    })

    // Then it asks for frames, from the start of the first flow
    expect(frame).toHaveBeenCalled()
    expect(textOf(root, "nbTitle")).toBe("Notebook 1")
    expect(root.classList.contains("instant")).toBe(false)

    // When
    scene.destroy()

    // Then
    expect(cancel).toHaveBeenCalled()
  })

  it("takes its colours from the console's theme", () => {
    // When
    const dark = scenePaletteOf(darkTheme)
    const light = scenePaletteOf(lightTheme)

    // Then
    expect(dark.canvas).toBe(darkTheme.color.surfaceStage)
    expect(light.canvas).toBe(lightTheme.color.surfaceStage)
    expect(light.primary).toBe(lightTheme.color.contentPrimary)
    expect(light.eur).toBe(lightTheme.color.chartSeries1)
    expect(dark.userBubble).toBe(darkTheme.color.authBackdrop)
    expect(light.userBubble).toBe(lightTheme.color.surfaceValue)
    expect(dark.shadow).toBe(darkTheme.color.shadowStrong)
    expect(light.shadow).toBe(lightTheme.color.shadowStrong)
    for (const [palette, { color }] of [
      [dark, darkTheme],
      [light, lightTheme],
    ] as const) {
      expect(palette.inverse).toBe(color.contentInverse)
      expect(palette.aiStart).toBe(color.aiPinkStart)
      expect(palette.aiEnd).toBe(color.aiPinkEnd)
      expect(palette.pointer).toBe(color.contentInverse)
      expect(palette.pointerEdge).toBe(color.neutralInk)
    }
  })

  it.each([
    ["dark", darkTheme],
    ["light", lightTheme],
  ])("draws its candles as the notebook charts fill them, %s", (_, theme) => {
    // Given the notebook chart's candlestick style in this theme
    const candle = createQuestdbTheme(theme.color).candlestick.itemStyle

    // When
    const palette = scenePaletteOf(theme)

    // Then rising and falling candles take its fill colours
    expect(palette.up).toBe(candle.color)
    expect(palette.down).toBe(candle.color0)
  })
})
