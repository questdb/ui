import { useEffect } from "react"
import { watchMountedCellNodes } from "../mountedCellNodes"
import { useChartRefresh } from "./ChartRefreshContext"

// One scroll-container height of overscan in both directions
const OVERSCAN_ROOT_MARGIN = "100% 0px 100% 0px"

export const useChartCellVisibility = () => {
  const engine = useChartRefresh()

  useEffect(() => {
    if (!engine || typeof IntersectionObserver === "undefined") return

    let observer: IntersectionObserver | null = null

    const handleEntries = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const cellId = entry.target.getAttribute("data-cell-id")
        if (cellId) engine.setVisible(cellId, entry.isIntersecting)
      }
    }

    const unwatch = watchMountedCellNodes(({ nodes, scrollContainer }) => {
      observer?.disconnect()
      observer = null
      if (nodes.length === 0) return
      if (!scrollContainer) {
        // Scroll container not found, do not block any cells
        for (const node of nodes) {
          const cellId = node.getAttribute("data-cell-id")
          if (cellId) engine.setVisible(cellId, true)
        }
        return
      }
      observer = new IntersectionObserver(handleEntries, {
        root: scrollContainer,
        rootMargin: OVERSCAN_ROOT_MARGIN,
      })
      for (const node of nodes) observer.observe(node)
    })

    return () => {
      unwatch()
      observer?.disconnect()
    }
  }, [engine])
}
