import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCellBandObserver } from "./useCellBandObservers"
import type { MountedCellNodes } from "./mountedCellNodes"

const NEAR_MARGIN = "100% 0px 100% 0px"
const FAR_MARGIN = "300% 0px 300% 0px"

// The node test environment has no DOM; the observer only needs these surfaces.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  disconnected = false

  constructor(
    public callback: IntersectionObserverCallback,
    public options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.observed.add(el)
  }

  unobserve(el: Element) {
    this.observed.delete(el)
  }

  disconnect() {
    this.disconnected = true
    this.observed.clear()
  }
}

const cellNode = (cellId: string): HTMLElement =>
  ({
    getAttribute: (name: string) => (name === "data-cell-id" ? cellId : null),
  }) as unknown as HTMLElement

const container = (): Element => ({}) as Element

const report = (overrides: Partial<MountedCellNodes>): MountedCellNodes => ({
  nodes: [],
  added: [],
  removed: [],
  scrollContainer: null,
  ...overrides,
})

const bandEntry = (
  target: HTMLElement,
  isIntersecting: boolean,
  rects?: {
    rootTop: number
    rootHeight: number
    cellTop: number
    cellHeight: number
  },
): IntersectionObserverEntry =>
  ({
    target,
    isIntersecting,
    rootBounds: rects ? { top: rects.rootTop, height: rects.rootHeight } : null,
    boundingClientRect: rects
      ? { top: rects.cellTop, height: rects.cellHeight }
      : { top: 0, height: 0 },
  }) as unknown as IntersectionObserverEntry

const makeHandlers = () => ({
  onNearBand: vi.fn(),
  onFarBand: vi.fn(),
  onUnrooted: vi.fn(),
})

const observersByMargin = () => {
  const near = FakeIntersectionObserver.instances.find(
    (o) => o.options.rootMargin === NEAR_MARGIN && !o.disconnected,
  )
  const far = FakeIntersectionObserver.instances.find(
    (o) => o.options.rootMargin === FAR_MARGIN && !o.disconnected,
  )
  return { near, far }
}

describe("createCellBandObserver", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("creates one observer per band rooted at the scroll container and observes every node", () => {
    // Given two mounted cells inside a scroll container
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const root = container()
    const [n1, n2] = [cellNode("c1"), cellNode("c2")]

    // When the first node report arrives
    bands.handleCellNodes(
      report({ nodes: [n1, n2], added: [n1, n2], scrollContainer: root }),
    )

    // Then a near and a far observer exist, both rooted at the container,
    // both watching both cells
    expect(FakeIntersectionObserver.instances).toHaveLength(2)
    const { near, far } = observersByMargin()
    expect(near?.options.root).toBe(root)
    expect(far?.options.root).toBe(root)
    expect([...near!.observed]).toEqual([n1, n2])
    expect([...far!.observed]).toEqual([n1, n2])
  })

  it("observes only added nodes and unobserves removed ones on later reports", () => {
    // Given an established observer over two cells
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const root = container()
    const [n1, n2, n3] = [cellNode("c1"), cellNode("c2"), cellNode("c3")]
    bands.handleCellNodes(
      report({ nodes: [n1, n2], added: [n1, n2], scrollContainer: root }),
    )

    // When one cell is removed and another added
    bands.handleCellNodes(
      report({
        nodes: [n2, n3],
        added: [n3],
        removed: [n1],
        scrollContainer: root,
      }),
    )

    // Then the same observers were kept and now watch exactly the live cells
    expect(FakeIntersectionObserver.instances).toHaveLength(2)
    const { near, far } = observersByMargin()
    expect([...near!.observed]).toEqual([n2, n3])
    expect([...far!.observed]).toEqual([n2, n3])
  })

  it("rebuilds both observers when the scroll container changes", () => {
    // Given observers rooted at the first container
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const [rootA, rootB] = [container(), container()]
    const node = cellNode("c1")
    bands.handleCellNodes(
      report({ nodes: [node], added: [node], scrollContainer: rootA }),
    )
    const first = [...FakeIntersectionObserver.instances]

    // When the same cell set reports under a new container (layout switch)
    bands.handleCellNodes(report({ nodes: [node], scrollContainer: rootB }))

    // Then the old observers are disconnected and fresh ones observe the
    // cell at the new root
    expect(first.every((o) => o.disconnected)).toBe(true)
    const { near, far } = observersByMargin()
    expect(near?.options.root).toBe(rootB)
    expect(far?.options.root).toBe(rootB)
    expect([...near!.observed]).toEqual([node])
    expect([...far!.observed]).toEqual([node])
  })

  it("reports near-band crossings with the distance to the viewport center", () => {
    // Given an observed cell
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const node = cellNode("c1")
    bands.handleCellNodes(
      report({ nodes: [node], added: [node], scrollContainer: container() }),
    )

    // When the near observer fires for a cell centered 250px above the
    // viewport center (root center 500, cell center 250)
    const { near } = observersByMargin()
    near!.callback(
      [
        bandEntry(node, true, {
          rootTop: 0,
          rootHeight: 1000,
          cellTop: 200,
          cellHeight: 100,
        }),
      ],
      near as unknown as IntersectionObserver,
    )

    // Then the handler receives the cell, its band state, and the distance
    expect(handlers.onNearBand).toHaveBeenCalledWith("c1", true, 250)
    expect(handlers.onFarBand).not.toHaveBeenCalled()
  })

  it("routes far-band crossings to onFarBand", () => {
    // Given an observed cell
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const node = cellNode("c1")
    bands.handleCellNodes(
      report({ nodes: [node], added: [node], scrollContainer: container() }),
    )

    // When the far observer reports the cell leaving the band
    const { far } = observersByMargin()
    far!.callback(
      [bandEntry(node, false)],
      far as unknown as IntersectionObserver,
    )

    // Then only the far handler hears it
    expect(handlers.onFarBand).toHaveBeenCalledWith("c1", false)
    expect(handlers.onNearBand).not.toHaveBeenCalled()
  })

  it("hands every cell id to onUnrooted when there is no scroll container", () => {
    // Given cells reported without a scroll container to root the bands at
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)

    // When the report arrives
    bands.handleCellNodes(report({ nodes: [cellNode("c1"), cellNode("c2")] }))

    // Then no observers are created and the caller gets every cell id
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    expect(handlers.onUnrooted).toHaveBeenCalledWith(["c1", "c2"])
  })

  it("disconnects the observers when no cells remain", () => {
    // Given an established observer
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const node = cellNode("c1")
    bands.handleCellNodes(
      report({ nodes: [node], added: [node], scrollContainer: container() }),
    )

    // When every cell is gone
    bands.handleCellNodes(report({ removed: [node] }))

    // Then both observers are torn down
    expect(
      FakeIntersectionObserver.instances.every((o) => o.disconnected),
    ).toBe(true)
  })

  it("disconnect tears down both observers", () => {
    // Given an established observer
    const handlers = makeHandlers()
    const bands = createCellBandObserver(handlers)
    const node = cellNode("c1")
    bands.handleCellNodes(
      report({ nodes: [node], added: [node], scrollContainer: container() }),
    )

    // When the owner disposes it (hook cleanup)
    bands.disconnect()

    // Then both observers are torn down
    expect(
      FakeIntersectionObserver.instances.every((o) => o.disconnected),
    ).toBe(true)
  })
})
