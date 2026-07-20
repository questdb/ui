const CELL_SELECTOR = "[data-notebook-cell][data-cell-id]"
const SCROLL_CONTAINER_SELECTOR = "#notebook-scroll-container"

export type MountedCellNodes = {
  nodes: HTMLElement[]
  scrollContainer: Element | null
}

export const watchMountedCellNodes = (
  onChange: (cellNodes: MountedCellNodes) => void,
): (() => void) => {
  let observed = new Set<Element>()
  let scrollContainer: Element | null = null
  let rafId = 0
  let disposed = false

  const scan = () => {
    rafId = 0
    if (disposed) return
    scrollContainer = document.querySelector(SCROLL_CONTAINER_SELECTOR)
    const nodes = Array.from(
      (scrollContainer ?? document).querySelectorAll<HTMLElement>(
        CELL_SELECTOR,
      ),
    )
    const unchanged =
      nodes.length === observed.size && nodes.every((n) => observed.has(n))
    if (unchanged) return
    observed = new Set(nodes)
    onChange({ nodes, scrollContainer })
  }

  const scheduleScan = () => {
    if (rafId) return
    rafId = requestAnimationFrame(scan)
  }

  const mayChangeCellSet = (records: MutationRecord[]): boolean => {
    if (!scrollContainer || !scrollContainer.isConnected) return true
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element)) continue
      if (!scrollContainer.contains(target)) continue
      if (target.closest(CELL_SELECTOR)) continue
      return true
    }
    return false
  }

  const mutations = new MutationObserver((records) => {
    if (mayChangeCellSet(records)) scheduleScan()
  })
  mutations.observe(document.body, { childList: true, subtree: true })
  scan()

  return () => {
    disposed = true
    mutations.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
  }
}
