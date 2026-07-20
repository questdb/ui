import { useEffect } from "react"
import { watchMountedCellNodes } from "../mountedCellNodes"
import { useCellVirtualizationEngine } from "./CellVirtualizationContext"

// Mount inside ±1 scroll-container height, retain until ±3.
const MOUNT_BAND_ROOT_MARGIN = "100% 0px 100% 0px"
const RETAIN_BAND_ROOT_MARGIN = "300% 0px 300% 0px"

const distanceToRootCenter = (entry: IntersectionObserverEntry): number => {
  if (!entry.rootBounds) return 0
  const rootCenter = entry.rootBounds.top + entry.rootBounds.height / 2
  const cellCenter =
    entry.boundingClientRect.top + entry.boundingClientRect.height / 2
  return Math.abs(cellCenter - rootCenter)
}

export const useCellVirtualizationObserver = () => {
  const engine = useCellVirtualizationEngine()

  useEffect(() => {
    if (!engine || typeof IntersectionObserver === "undefined") return

    let mountObserver: IntersectionObserver | null = null
    let retainObserver: IntersectionObserver | null = null

    const handleMountEntries = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const cellId = entry.target.getAttribute("data-cell-id")
        if (!cellId) continue
        engine.reportMountBand(
          cellId,
          entry.isIntersecting,
          distanceToRootCenter(entry),
        )
      }
    }

    const handleRetainEntries = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const cellId = entry.target.getAttribute("data-cell-id")
        if (cellId) engine.reportRetainBand(cellId, entry.isIntersecting)
      }
    }

    const disconnect = () => {
      mountObserver?.disconnect()
      retainObserver?.disconnect()
      mountObserver = null
      retainObserver = null
    }

    const unwatch = watchMountedCellNodes(({ nodes, scrollContainer }) => {
      disconnect()
      if (nodes.length === 0) return
      if (!scrollContainer) {
        for (const node of nodes) {
          const cellId = node.getAttribute("data-cell-id")
          if (cellId) engine.ensureFullContent(cellId)
        }
        return
      }
      mountObserver = new IntersectionObserver(handleMountEntries, {
        root: scrollContainer,
        rootMargin: MOUNT_BAND_ROOT_MARGIN,
      })
      retainObserver = new IntersectionObserver(handleRetainEntries, {
        root: scrollContainer,
        rootMargin: RETAIN_BAND_ROOT_MARGIN,
      })
      for (const node of nodes) {
        mountObserver.observe(node)
        retainObserver.observe(node)
      }
    })

    return () => {
      unwatch()
      disconnect()
    }
  }, [engine])
}
