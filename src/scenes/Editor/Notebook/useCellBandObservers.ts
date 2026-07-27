import { useEffect } from "react"
import {
  watchMountedCellNodes,
  type MountedCellNodes,
} from "./mountedCellNodes"

// Two nested bands around the scroll viewport, one observer each. This module
// is pure observation — what a band crossing MEANS is the caller's business.
const NEAR_BAND_ROOT_MARGIN = "100% 0px 100% 0px"
const FAR_BAND_ROOT_MARGIN = "300% 0px 300% 0px"

export type CellBandHandlers = {
  // ±1 viewport. distancePx is the cell's distance to the viewport center,
  // for nearest-first prioritization.
  onNearBand: (cellId: string, inBand: boolean, distancePx: number) => void
  // ±3 viewports.
  onFarBand: (cellId: string, inBand: boolean) => void
  // No scroll container to root the bands at — the caller decides the
  // nothing-is-offscreen policy.
  onUnrooted: (cellIds: string[]) => void
}

const distanceToRootCenter = (entry: IntersectionObserverEntry): number => {
  if (!entry.rootBounds) return 0
  const rootCenter = entry.rootBounds.top + entry.rootBounds.height / 2
  const cellCenter =
    entry.boundingClientRect.top + entry.boundingClientRect.height / 2
  return Math.abs(cellCenter - rootCenter)
}

export const createCellBandObserver = ({
  onNearBand,
  onFarBand,
  onUnrooted,
}: CellBandHandlers) => {
  let nearObserver: IntersectionObserver | null = null
  let farObserver: IntersectionObserver | null = null
  let observerRoot: Element | null = null

  const handleNearEntries = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const cellId = entry.target.getAttribute("data-cell-id")
      if (!cellId) continue
      onNearBand(cellId, entry.isIntersecting, distanceToRootCenter(entry))
    }
  }

  const handleFarEntries = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const cellId = entry.target.getAttribute("data-cell-id")
      if (cellId) onFarBand(cellId, entry.isIntersecting)
    }
  }

  const disconnect = () => {
    nearObserver?.disconnect()
    farObserver?.disconnect()
    nearObserver = null
    farObserver = null
    observerRoot = null
  }

  const observe = (node: HTMLElement) => {
    nearObserver?.observe(node)
    farObserver?.observe(node)
  }

  const unobserve = (node: HTMLElement) => {
    nearObserver?.unobserve(node)
    farObserver?.unobserve(node)
  }

  const handleCellNodes = ({
    nodes,
    added,
    removed,
    scrollContainer,
  }: MountedCellNodes) => {
    if (nodes.length === 0) {
      disconnect()
      return
    }
    if (!scrollContainer) {
      disconnect()
      const cellIds = nodes
        .map((node) => node.getAttribute("data-cell-id"))
        .filter((cellId): cellId is string => cellId !== null)
      onUnrooted(cellIds)
      return
    }
    if (!nearObserver || !farObserver || observerRoot !== scrollContainer) {
      disconnect()
      nearObserver = new IntersectionObserver(handleNearEntries, {
        root: scrollContainer,
        rootMargin: NEAR_BAND_ROOT_MARGIN,
      })
      farObserver = new IntersectionObserver(handleFarEntries, {
        root: scrollContainer,
        rootMargin: FAR_BAND_ROOT_MARGIN,
      })
      observerRoot = scrollContainer
      for (const node of nodes) observe(node)
      return
    }
    for (const node of removed) unobserve(node)
    for (const node of added) observe(node)
  }

  return { handleCellNodes, disconnect }
}

export const useCellBandObservers = ({
  onNearBand,
  onFarBand,
  onUnrooted,
}: CellBandHandlers) => {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const bands = createCellBandObserver({ onNearBand, onFarBand, onUnrooted })
    const unwatch = watchMountedCellNodes(bands.handleCellNodes)
    return () => {
      unwatch()
      bands.disconnect()
    }
  }, [onNearBand, onFarBand, onUnrooted])
}
