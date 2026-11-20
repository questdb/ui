import React, { Component, lazy, Suspense } from "react"
import styled from "styled-components"
import { Button } from "../../../../components"
import { ChartPlaceholder } from "../cellVirtualization/ChartPlaceholder"
import { PaneEmptyState } from "../PaneEmptyState"

// The chart code (ECharts, its chart types, the dashboard components and
// custom options) loads when a chart first draws, so a console that shows no
// chart does not download it.

const loadChartRenderer = () => import("./ChartRenderer")
const loadCustomChart = () => import("../customChart/CustomChart")
const loadVisualCanvas = () => import("../visuals/VisualCanvas")

export const LazyChartRenderer = lazy(() =>
  loadChartRenderer().then((m) => ({ default: m.ChartRenderer })),
)

export const LazyCustomChart = lazy(() =>
  loadCustomChart().then((m) => ({ default: m.CustomChart })),
)

export const LazyVisualCanvas = lazy(() =>
  loadVisualCanvas().then((m) => ({ default: m.VisualCanvas })),
)

/**
 * Starts downloading the chart code for a cell about to draw, so it loads
 * while its query runs instead of after. A failed download is left to the
 * chart's own load, which reports it.
 */
export const preloadChartCode = (
  kind: "chart" | "custom" | "visual" = "chart",
): void => {
  const loads = [
    loadChartRenderer(),
    ...(kind === "custom" ? [loadCustomChart()] : []),
    ...(kind === "visual" ? [loadVisualCanvas()] : []),
  ]
  for (const load of loads) load.catch(() => undefined)
}

const Failed = styled(PaneEmptyState)`
  flex-direction: column;
  gap: 1.2rem;
  text-align: center;
  padding: 1.6rem;
`

type BoundaryProps = {
  children: React.ReactNode
  // What reloading costs where the boundary sits, e.g. a drawer's edits.
  reloadNote?: string
}

// What browsers throw when a dynamically imported module does not load.
const isLoadFailure = (error: unknown) =>
  error instanceof Error &&
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch/i.test(
    error.message,
  )

/**
 * Catches a chart code download that failed (a console upgraded under an
 * open tab, a flaky network) so it costs the chart, not the console. React
 * keeps a failed lazy load, so trying again means reloading the console.
 */
export class ChartCodeBoundary extends Component<
  BoundaryProps,
  { error: unknown }
> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    // Other errors are not ours to hide.
    if (!isLoadFailure(error))
      throw error instanceof Error
        ? error
        : new Error("A chart failed to draw.", { cause: error })
    return (
      <Failed role="alert" data-hook="chart-code-failed">
        Could not load the chart code.
        {this.props.reloadNote && <span>{this.props.reloadNote}</span>}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Reload the console
        </Button>
      </Failed>
    )
  }
}

/** Shows the chart placeholder while the chart code loads. */
export const ChartSuspense: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <ChartCodeBoundary>
    <Suspense fallback={<ChartPlaceholder />}>{children}</Suspense>
  </ChartCodeBoundary>
)
