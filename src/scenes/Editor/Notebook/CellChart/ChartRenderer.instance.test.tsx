// @vitest-environment jsdom
import React from "react"
import type { EChartsType } from "echarts"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
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

const chart = (
  specKey: string,
  onInstance: (i: EChartsType | null) => void,
) => (
  <ChartRenderer
    option={{ series: [] }}
    zoomWindow={{ start: 0, end: 100 }}
    zoomable={false}
    animateEntry={false}
    specKey={specKey}
    onInstance={onInstance}
  />
)

it("keeps a remounted instance registered when it is ready before the old cleanup", () => {
  const onInstance = vi.fn<[EChartsType | null], void>()
  const view = renderComponent(chart("a", onInstance))
  view.rerender(chart("b", onInstance))
  const reported = onInstance.mock.calls.map(([instance]) =>
    instance ? (instance as unknown as { id: number }).id : null,
  )
  expect(reported.at(-1)).toBe(2)
  expect(reported).not.toContain(null)
  view.unmount()
  expect(onInstance).toHaveBeenLastCalledWith(null)
})
