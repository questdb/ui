import { useEffect } from "react"
import { useChartRefresh } from "./ChartRefreshContext"

// One scroll-container height of overscan in both directions
const OVERSCAN_ROOT_MARGIN = "100% 0px 100% 0px"
const CELL_SELECTOR = "[data-notebook-cell][data-cell-id]"
const SCROLL_CONTAINER_SELECTOR = "#notebook-scroll-container"

export const useChartCellVisibility = () => {
  const engine = useChartRefresh()

  useEffect(() => {
    if (!engine || typeof IntersectionObserver === "undefined") return

    let observer: IntersectionObserver | null = null
    let observed = new Set<Element>()

    const handleEntries = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const cellId = entry.target.getAttribute("data-cell-id")
        if (cellId) engine.setVisible(cellId, entry.isIntersecting)
      }
    }

    const observeCells = () => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(CELL_SELECTOR),
      )
      const unchanged =
        nodes.length === observed.size && nodes.every((n) => observed.has(n))
      if (unchanged) return
      observer?.disconnect()
      observer = null
      observed = new Set(nodes)
      if (nodes.length === 0) return
      const root = nodes[0].closest(SCROLL_CONTAINER_SELECTOR)
      if (!root) {
        // Scroll container not found, do not block any cells
        for (const node of nodes) {
          const cellId = node.getAttribute("data-cell-id")
          if (cellId) engine.setVisible(cellId, true)
        }
        return
      }
      observer = new IntersectionObserver(handleEntries, {
        root,
        rootMargin: OVERSCAN_ROOT_MARGIN,
      })
      for (const node of nodes) observer.observe(node)
    }

    const mutations = new MutationObserver(observeCells)
    mutations.observe(document.body, { childList: true, subtree: true })
    observeCells()

    return () => {
      mutations.disconnect()
      observer?.disconnect()
    }
  }, [engine])
}
