const CELL_SELECTOR = "[data-notebook-cell][data-cell-id]"
const SCROLL_CONTAINER_SELECTOR = "#notebook-scroll-container"
const NOTEBOOK_ROOT_SELECTOR = "[data-notebook-root]"

export type MountedCellNodes = {
  nodes: HTMLElement[]
  added: HTMLElement[]
  removed: HTMLElement[]
  scrollContainer: Element | null
}

type Subscriber = (cellNodes: MountedCellNodes) => void

const subscribers = new Set<Subscriber>()
let current: MountedCellNodes | null = null
let observed = new Set<HTMLElement>()
let scrollContainer: Element | null = null
let mutations: MutationObserver | null = null
let observedRoot: Node | null = null
let rafId = 0

const observeNotebookRoot = () => {
  if (!mutations) return
  const root = document.querySelector(NOTEBOOK_ROOT_SELECTOR) ?? document.body
  if (observedRoot === root) return
  observedRoot = root
  mutations.disconnect()
  mutations.observe(root, { childList: true, subtree: true })
}

const scan = () => {
  rafId = 0
  if (!mutations) return
  observeNotebookRoot()
  const previousContainer = scrollContainer
  scrollContainer = document.querySelector(SCROLL_CONTAINER_SELECTOR)
  const nodes = Array.from(
    (scrollContainer ?? document).querySelectorAll<HTMLElement>(CELL_SELECTOR),
  )
  const next = new Set(nodes)
  const added = nodes.filter((node) => !observed.has(node))
  const removed = [...observed].filter((node) => !next.has(node))
  if (
    added.length === 0 &&
    removed.length === 0 &&
    scrollContainer === previousContainer
  )
    return
  observed = next
  current = { nodes, added, removed, scrollContainer }
  for (const subscriber of subscribers) subscriber(current)
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

const start = () => {
  mutations = new MutationObserver((records) => {
    if (mayChangeCellSet(records)) scheduleScan()
  })
  scan()
}

const stop = () => {
  mutations?.disconnect()
  mutations = null
  observedRoot = null
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  current = null
  observed = new Set()
  scrollContainer = null
}

export const watchMountedCellNodes = (onChange: Subscriber): (() => void) => {
  subscribers.add(onChange)
  if (subscribers.size === 1) start()
  else if (current) {
    // Initial subscription takes all as added
    onChange({ ...current, added: current.nodes, removed: [] })
  }
  return () => {
    if (!subscribers.delete(onChange)) return
    if (subscribers.size === 0) stop()
  }
}
