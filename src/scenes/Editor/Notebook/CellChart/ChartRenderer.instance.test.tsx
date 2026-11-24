// @vitest-environment jsdom
import React from "react"
import type { EChartsType } from "echarts"
import { ThemeProvider } from "styled-components"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { darkTheme, lightTheme } from "../../../../theme"
import { ChartRenderer } from "./ChartRenderer"

vi.mock("../NotebookProvider", () => ({ useNotebookBufferId: () => undefined }))

// A chart that becomes ready while React commits its mount: the new instance
// is reported before the previous key's passive cleanup, the order a browser
// can produce when an animation frame runs before React flushes effects.
vi.mock("echarts-for-react/lib/core", async () => {
  const { Component } = await import("react")
  let next = 0
  class FakeECharts extends Component<{
    onChartReady?: (instance: unknown) => void
  }> {
    disposed = false
    instance = {
      id: ++next,
      isDisposed: () => this.disposed,
      on: () => undefined,
      off: () => undefined,
      getOption: () => ({}),
      dispatchAction: () => undefined,
    }
    componentDidMount() {
      this.props.onChartReady?.(this.instance)
    }
    componentWillUnmount() {
      this.disposed = true
    }
    getEchartsInstance() {
      return this.instance
    }
    render() {
      return null
    }
  }
  return { default: FakeECharts }
})

// A theme change is what draws a chart on a new instance.
const chart = (
  theme: typeof lightTheme,
  onInstance: (i: EChartsType | null) => void,
) => (
  <ThemeProvider theme={theme}>
    <ChartRenderer
      option={{ series: [] }}
      zoomable={false}
      animateEntry={false}
      onInstance={onInstance}
    />
  </ThemeProvider>
)

it("keeps a remounted instance registered when it is ready before the old cleanup", () => {
  const onInstance = vi.fn<[EChartsType | null], void>()
  const view = renderComponent(chart(lightTheme, onInstance))
  view.rerender(chart(darkTheme, onInstance))
  const reported = onInstance.mock.calls.map(([instance]) =>
    instance ? (instance as unknown as { id: number }).id : null,
  )
  expect(reported.at(-1)).toBe(2)
  expect(reported).not.toContain(null)
  view.unmount()
  expect(onInstance).toHaveBeenLastCalledWith(null)
})
