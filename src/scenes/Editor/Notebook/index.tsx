import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled, { css } from "styled-components"
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type EventCallback,
  type Layout,
  type LayoutItem,
  verticalCompactor,
} from "react-grid-layout"
import { absoluteStrategy } from "react-grid-layout/core"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { useEditor } from "../../../providers/EditorProvider"
import type { CellLayoutItem, NotebookViewState } from "../../../store/notebook"
import {
  beginNotebookMount,
  cancelNotebookMount,
  migratePersistedNotebookView,
} from "../../../utils/notebooks/notebookController"
import { NotebookToolError } from "../../../utils/notebooks/notebookToolError"
import { color } from "../../../utils"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookBufferId,
  useNotebookState,
} from "./NotebookProvider"
import { Cell } from "./cells/Cell"
import { MarkdownCell } from "./cells/MarkdownCell"
import type { NotebookCell } from "../../../store/notebook"
import { AddCellBottom, AddCellBetween } from "./cells/AddCellButton"
import { Button, LoadingSpinner } from "../../../components"
import { NotebookToolbar } from "./NotebookToolbar"
import { NotebookMcpPromo } from "./NotebookMcpPromo"
import { renderEdgeHandle } from "./resize"
import {
  cellChromePx,
  cellHeightPatchForRows,
  computeCellGridH,
  generateDefaultLayout as generateDefaultLayoutPure,
  isDoubleView,
  isExpectingResult,
  mergeCellLayout,
  MIN_BOTTOM_HEIGHT_PX,
  minTopHeightFor,
  NOTEBOOK_GRID_COLS,
  NOTEBOOK_GRID_MARGIN_Y,
  NOTEBOOK_GRID_ROW_HEIGHT,
} from "./notebookUtils"
import {
  emitUserAction,
  on as onUserAction,
} from "../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { consumeReveal, getPendingReveal } from "./cellReveal"
import { useChartCellVisibility } from "./chartRefresh/useChartCellVisibility"
import { useCellVirtualizationObserver } from "./cellVirtualization/useCellVirtualizationObserver"
import { useCellVirtualizationEngine } from "./cellVirtualization/CellVirtualizationContext"

const GRID_COLS = NOTEBOOK_GRID_COLS
const ROW_HEIGHT = NOTEBOOK_GRID_ROW_HEIGHT
const DEFAULT_CELL_H = 30 // 30 × 10 = 300 px (was 6 × 50 = 300 px)

const NotebookWrapper = styled.div.attrs({ "data-notebook-root": "true" })`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`

const CellListContainer = styled.div<{ $maximized?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: ${({ $maximized }) => ($maximized ? "hidden" : "auto")};
  padding: ${({ $maximized }) => ($maximized ? "0" : "2rem")};
  gap: 2rem;
  background: ${color("midnight")};
  /* Scroll anchoring fights arrow-key reordering: on a move-up React keeps the
     focused cell's DOM node in place, the browser anchors to it and adjusts
     scrollTop so the cell looks frozen while the cells above shuffle. Disabled
     so the moved cell visibly travels and scrollIntoView can pin it. */
  overflow-anchor: none;
`

const PromoGridSlot = styled.div`
  &:not(:empty) {
    margin-bottom: 2rem;
  }
`

const CellItem = styled.div<{ $maximized?: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  ${({ $maximized }) => $maximized && `flex: 1; min-height: 0;`}
`

type GridCellWrapperProps = React.HTMLAttributes<HTMLDivElement> & {
  cellId: string
  focused?: boolean
}
const GridCellWrapper = React.forwardRef<HTMLDivElement, GridCellWrapperProps>(
  ({ children, style, className, cellId, focused, ...rest }, ref) => (
    <div
      ref={ref}
      data-cell-id={cellId}
      data-cell-focused={focused ? "true" : undefined}
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        // visible (not hidden) so the resize handle chips, which render as
        // children here and sit on/outside the cell edge, aren't clipped. The
        // inner CellWrapper still clips the cell's own content.
        overflow: "visible",
      }}
      className={className}
      {...rest}
    >
      {children}
    </div>
  ),
)

const GridScrollContainer = styled.div<{ $suppressTransitions?: boolean }>`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  background: ${color("midnight")};

  .react-grid-item.react-grid-placeholder {
    background: ${color("selection")};
    opacity: 0.25;
  }

  .react-grid-item {
    border-radius: 0.4rem;
  }

  /* A selected cell keeps its corner resize handles visible without hover. */
  [data-cell-focused="true"] .edge-handle--corner {
    opacity: 1;
  }

  /* On first mount, react-grid-layout's items would otherwise animate from
     their initial state to their computed position/size (the "expanding"
     glitch). Kill the transition until the layout has settled; it's re-enabled
     for drag/resize. */
  ${({ $suppressTransitions }) =>
    $suppressTransitions &&
    css`
      .react-grid-item {
        transition: none !important;
      }
    `}
`

const renderResizeHandle = renderEdgeHandle

const MIN_CELL_W = 2
// Minimum grid rows. Sized so the rendered floor is ~editor + chrome
// (`MIN_EDITOR_HEIGHT 72 + CELL_CHROME_PX 40 ≈ 112 px`), letting the
// user collapse a cell down to "just the editor". Rendered px for
// h rows in rgl with our margins = h*rowHeight + (h-1)*marginY
// = 5*10 + 4*20 = 130 px. Earlier value (20 rows) translated to 580 px
// once the marginY-aware math landed, which the user reported as an
// unwanted hard floor in grid mode.
const MIN_CELL_H = 5

const GRID_MARGIN_X = 20
const GRID_MARGIN_Y = NOTEBOOK_GRID_MARGIN_Y
const GRID_MARGIN: [number, number] = [GRID_MARGIN_X, GRID_MARGIN_Y]
const GRID_CONTAINER_PADDING: [number, number] = [0, 0]
const GRID_BREAKPOINTS = { lg: 0 }
const GRID_COLS_MAP = { lg: GRID_COLS }
const DRAG_CONFIG = {
  enabled: true,
  handle: ".cell-drag-handle",
  cancel: "button, a, input, select, textarea, .cell-toolbar",
}
const RESIZE_CONFIG = {
  enabled: true,
  handles: ["se", "sw", "s", "e", "w"] as const,
  handleComponent: renderResizeHandle,
}

const LAYOUT_OPTS = {
  gridCols: GRID_COLS,
  defaultCellH: DEFAULT_CELL_H,
  minW: MIN_CELL_W,
  minH: MIN_CELL_H,
}

const generateDefaultLayout = (cells: { id: string }[]): CellLayoutItem[] =>
  generateDefaultLayoutPure(cells, LAYOUT_OPTS)

const ADDED_CELL_SCROLL_SETTLE_MS = 250
const ADDED_CELL_SCROLL_BOTTOM_GAP_PX = 20

const useScrollUserAddedCellIntoView = () => {
  const bufferId = useNotebookBufferId()
  const virtualizationEngine = useCellVirtualizationEngine()
  useEffect(() => {
    let timer = 0
    const unsubscribe = onUserAction("user-action", (evt) => {
      const addedId =
        evt.kind === "user_added_cell" && evt.bufferId === bufferId
          ? evt.cellId
          : evt.kind === "user_duplicated_cell" && evt.bufferId === bufferId
            ? evt.newCellId
            : null
      if (!addedId) return
      virtualizationEngine?.ensureFullContent(addedId)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const node = document.querySelector<HTMLElement>(
          `[data-notebook-cell][data-cell-id="${CSS.escape(addedId)}"]`,
        )
        if (!node) return
        node.style.scrollMarginBottom = `${ADDED_CELL_SCROLL_BOTTOM_GAP_PX}px`
        node.scrollIntoView({ block: "nearest", behavior: "smooth" })
        node.style.scrollMarginBottom = ""
      }, ADDED_CELL_SCROLL_SETTLE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [bufferId, virtualizationEngine])
}

// Restoring a maximized cell re-renders the full list at scrollTop 0; scroll the
// just-restored cell back into view so the user lands where they left off.
const useScrollRestoredCellIntoView = (maximizedCellId: string | null) => {
  const virtualizationEngine = useCellVirtualizationEngine()
  const prev = React.useRef<string | null>(maximizedCellId)
  useEffect(() => {
    const restoredId = prev.current
    prev.current = maximizedCellId
    if (!restoredId || maximizedCellId) return
    virtualizationEngine?.ensureFullContent(restoredId)
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-notebook-cell][data-cell-id="${CSS.escape(restoredId)}"]`,
        )
        ?.scrollIntoView({ block: "nearest" })
    })
  }, [maximizedCellId, virtualizationEngine])
}

const readClientY = (event: Event): number | null => {
  if ("clientY" in event) return (event as MouseEvent).clientY
  const touch =
    (event as TouchEvent).touches?.[0] ??
    (event as TouchEvent).changedTouches?.[0]
  return touch ? touch.clientY : null
}

const EDGE_ZONE_PX = 64
const MAX_SCROLL_SPEED_PX = 18

const useGridDragAutoScroll = (containerRef: React.RefObject<HTMLElement>) => {
  const pointerYRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    pointerYRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    const el = containerRef.current
    const y = pointerYRef.current
    if (!el || y === null) {
      rafRef.current = null
      return
    }
    const rect = el.getBoundingClientRect()
    const distTop = y - rect.top
    const distBottom = rect.bottom - y
    let dy = 0
    if (distTop < EDGE_ZONE_PX) {
      dy = -MAX_SCROLL_SPEED_PX * (1 - Math.max(distTop, 0) / EDGE_ZONE_PX)
    } else if (distBottom < EDGE_ZONE_PX) {
      dy = MAX_SCROLL_SPEED_PX * (1 - Math.max(distBottom, 0) / EDGE_ZONE_PX)
    }
    if (dy !== 0) el.scrollBy(0, dy)
    rafRef.current = requestAnimationFrame(tick)
  }, [containerRef])

  const onDragStart = useCallback<EventCallback>(
    (_l, _o, _n, _p, event) => {
      pointerYRef.current = readClientY(event)
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  const onDrag = useCallback<EventCallback>((_l, _o, _n, _p, event) => {
    pointerYRef.current = readClientY(event)
  }, [])

  useEffect(() => stop, [stop])

  return { onDragStart, onDrag, stop }
}

// Routes each cell to its kind. The single branch point keeps all three
// render sites (list, grid, maximized) in sync.
type CellViewProps = {
  cell: NotebookCell
  index: number
  totalCells: number
  layoutMode: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  isRunning: boolean
  isHydrating: boolean
}

const CellView: React.FC<CellViewProps> = (props) =>
  props.cell.type === "markdown" ? (
    <MarkdownCell {...props} />
  ) : (
    <Cell {...props} />
  )

const ListLayout: React.FC = () => {
  const { cells, focusedCellId, maximizedCellId, runningCellIds, isHydrating } =
    useNotebookState()
  const { setFocusedCell } = useNotebookActions()
  useScrollUserAddedCellIntoView()

  return (
    <CellListContainer
      id="notebook-scroll-container"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (!target.closest("[data-notebook-cell]")) setFocusedCell(null)
      }}
    >
      <NotebookMcpPromo />
      {cells.map((cell, index) => (
        <React.Fragment key={cell.id}>
          <CellItem>
            <CellView
              cell={cell}
              index={index}
              totalCells={cells.length}
              layoutMode="list"
              isFocused={focusedCellId === cell.id}
              isMaximized={maximizedCellId === cell.id}
              isRunning={runningCellIds.has(cell.id)}
              isHydrating={isHydrating}
            />
          </CellItem>
          {index < cells.length - 1 && <AddCellBetween afterCellId={cell.id} />}
        </React.Fragment>
      ))}
      <AddCellBottom
        afterCellId={cells.length > 0 ? cells[cells.length - 1].id : undefined}
      />
    </CellListContainer>
  )
}

const GridLayout: React.FC = () => {
  const {
    cells,
    settings,
    focusedCellId,
    maximizedCellId,
    runningCellIds,
    isHydrating,
  } = useNotebookState()
  const { setFocusedCell, updateSettings, updateCell } = useNotebookActions()
  const { activeBuffer } = useEditor()
  // measureBeforeMount: don't render the grid until the container width is
  // measured, so cells first paint at their real width instead of animating
  // from the guessed initialWidth (react-grid-layout transitions the change).
  const {
    width: containerWidth,
    containerRef,
    mounted: gridMeasured,
  } = useContainerWidth({ measureBeforeMount: true })
  const autoScroll = useGridDragAutoScroll(
    containerRef as React.RefObject<HTMLElement>,
  )
  useScrollUserAddedCellIntoView()

  // Suppress react-grid-layout's item transition until the grid has rendered
  // and the width has settled, so cells don't animate into place on mount.
  // Two frames cover the initial render + the ResizeObserver's first callback.
  const [gridReady, setGridReady] = useState(false)
  useEffect(() => {
    if (!gridMeasured) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setGridReady(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [gridMeasured])

  // Derive each cell's grid h from topHeight + bottomHeight + chrome.
  // The h value in settings.layout is ignored on read — it's a stale
  // shadow that only matters when react-grid-layout consumes it. We
  // recompute every render so a content-driven topHeight or run-driven
  // bottomHeight change immediately resizes the grid cell.
  const currentLayout = useMemo<LayoutItem[]>(() => {
    const base = mergeCellLayout(
      settings.layout && settings.layout.length > 0
        ? settings.layout
        : generateDefaultLayout(cells),
      cells,
      LAYOUT_OPTS,
    ) as LayoutItem[]
    const cellById = new Map(cells.map((c) => [c.id, c]))
    return base.map((item) => {
      const cell = cellById.get(item.i)
      if (!cell) return item
      const expectingResult = isExpectingResult(cell, isHydrating)
      const minBottomPx =
        isDoubleView(cell) || expectingResult ? MIN_BOTTOM_HEIGHT_PX : 0
      const minTotalPx =
        minTopHeightFor(cell) + minBottomPx + cellChromePx(cell)
      const minH = Math.ceil(
        (minTotalPx + GRID_MARGIN_Y) / (ROW_HEIGHT + GRID_MARGIN_Y),
      )
      return {
        ...item,
        h: computeCellGridH(cell, ROW_HEIGHT, GRID_MARGIN_Y, expectingResult),
        minH,
      }
    })
  }, [settings.layout, cells, isHydrating])

  const mapLayoutXYW = useCallback(
    (rglLayout: Layout): CellLayoutItem[] =>
      [...rglLayout]
        .filter((item: LayoutItem) => cells.some((c) => c.id === item.i))
        .map((item: LayoutItem) => ({
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          // Persist whatever h react-grid-layout reports; it's recomputed
          // on next render by computeCellGridH anyway. Keeping it here
          // means we don't have to special-case the persisted shape.
          h: item.h,
        })),
    [cells],
  )

  // Drag-stop = move (x/y change). Just persist positions.
  const handleDragStop = useCallback(
    (newLayout: Layout, ..._args: unknown[]) => {
      autoScroll.stop()
      updateSettings({ layout: mapLayoutXYW(newLayout) })
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    },
    [autoScroll, mapLayoutXYW, updateSettings, activeBuffer.id],
  )

  const handleResizeStop = useCallback(
    (newLayout: Layout, ..._args: unknown[]) => {
      updateSettings({ layout: mapLayoutXYW(newLayout) })
      const cellById = new Map(cells.map((c) => [c.id, c]))
      for (const item of newLayout) {
        const cell = cellById.get(item.i)
        if (!cell) continue
        // rgl reports every cell; the helper no-ops those whose h is unchanged.
        const patch = cellHeightPatchForRows(
          cell,
          item.h,
          ROW_HEIGHT,
          GRID_MARGIN_Y,
        )
        if (Object.keys(patch).length > 0) updateCell(cell.id, patch)
      }
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    },
    [mapLayoutXYW, updateSettings, updateCell, cells, activeBuffer.id],
  )

  useEffect(() => {
    const handler = (payload?: {
      cellId?: string
      kind?: "full" | "right" | "left"
    }) => {
      const cellId = payload?.cellId
      const kind = payload?.kind
      if (!cellId || !kind) return
      const cur = currentLayout.find((l) => l.i === cellId)
      if (!cur) return
      let nextX = cur.x
      let nextW = cur.w
      if (kind === "full") {
        nextX = 0
        nextW = GRID_COLS
      } else if (kind === "right") {
        nextW = GRID_COLS - cur.x
      } else if (kind === "left") {
        nextX = 0
        nextW = cur.x + cur.w
      }
      if (nextX === cur.x && nextW === cur.w) return
      const nextLayout: CellLayoutItem[] = currentLayout.map((l) =>
        l.i === cellId
          ? { i: l.i, x: nextX, y: l.y, w: nextW, h: l.h }
          : { i: l.i, x: l.x, y: l.y, w: l.w, h: l.h },
      )
      updateSettings({ layout: nextLayout })
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_EXPAND_WIDTH, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_EXPAND_WIDTH, handler)
  }, [currentLayout, updateSettings, activeBuffer.id])

  return (
    <GridScrollContainer
      ref={containerRef as React.RefObject<HTMLDivElement>}
      id="notebook-scroll-container"
      $suppressTransitions={!gridReady}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        const gridItem = target.closest<HTMLElement>("[data-cell-id]")
        if (gridItem?.dataset.cellId) {
          setFocusedCell(gridItem.dataset.cellId)
        } else {
          setFocusedCell(null)
        }
      }}
    >
      <PromoGridSlot>
        <NotebookMcpPromo />
      </PromoGridSlot>
      {/* No `key` on ResponsiveGridLayout: keying it on cellIds would
       * unmount every Cell/DrawCanvas on add/remove and wipe chart state.
       * rgl reconciles children by their own key matched against
       * layouts.lg[].i. */}
      {gridMeasured && (
        <ResponsiveGridLayout
          width={containerWidth}
          layouts={{ lg: currentLayout as unknown as Layout }}
          breakpoints={GRID_BREAKPOINTS}
          cols={GRID_COLS_MAP}
          rowHeight={ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={GRID_CONTAINER_PADDING}
          dragConfig={DRAG_CONFIG}
          resizeConfig={RESIZE_CONFIG}
          compactor={verticalCompactor}
          onDragStart={autoScroll.onDragStart}
          onDrag={autoScroll.onDrag}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          positionStrategy={absoluteStrategy}
        >
          {cells.map((cell, index) => (
            <GridCellWrapper
              key={cell.id}
              cellId={cell.id}
              focused={focusedCellId === cell.id}
            >
              <CellView
                cell={cell}
                index={index}
                totalCells={cells.length}
                layoutMode="grid"
                isFocused={focusedCellId === cell.id}
                isMaximized={maximizedCellId === cell.id}
                isRunning={runningCellIds.has(cell.id)}
                isHydrating={isHydrating}
              />
            </GridCellWrapper>
          ))}
        </ResponsiveGridLayout>
      )}
      <AddCellBottom
        afterCellId={cells.length > 0 ? cells[cells.length - 1].id : undefined}
      />
    </GridScrollContainer>
  )
}

const REVEAL_SCROLL_RETRIES = 8

// The cell may not be in the DOM yet on a cold (grid) mount; retry across frames
// until it appears. A cell that no longer exists (deleted while away) never
// resolves and is silently skipped once the retries are exhausted.
const scrollNotebookCellIntoView = (cellId: string, attempt = 0): void => {
  const node = document.querySelector<HTMLElement>(
    `[data-notebook-cell][data-cell-id="${CSS.escape(cellId)}"]`,
  )
  if (node) {
    node.scrollIntoView({ block: "center" })
  } else if (attempt < REVEAL_SCROLL_RETRIES) {
    requestAnimationFrame(() => scrollNotebookCellIntoView(cellId, attempt + 1))
  }
}

let isFirstNotebookMountSinceLoad = true

const RELOAD_SCROLL_SETTLE_MS = 120

const useScrollFocusedCellIntoViewOnOpen = (
  focusedCellId: string | null,
  isHydrating: boolean,
) => {
  const focusedOnOpenRef = useRef(focusedCellId)
  const isReloadRef = useRef(isFirstNotebookMountSinceLoad)
  const didScrollRef = useRef(false)

  useEffect(() => {
    isFirstNotebookMountSinceLoad = false
  }, [])

  useEffect(() => {
    const cellId = focusedOnOpenRef.current
    if (!cellId || didScrollRef.current || getPendingReveal()) return

    if (!isReloadRef.current) {
      didScrollRef.current = true
      scrollNotebookCellIntoView(cellId)
      return
    }

    if (isHydrating) return
    didScrollRef.current = true
    const timer = setTimeout(
      () => scrollNotebookCellIntoView(cellId),
      RELOAD_SCROLL_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [isHydrating])
}

// Scroll + glow the cell a search result points at, drained on mount and on the nudge.
const useNotebookSearchReveal = () => {
  const { activeBuffer, isNavigatingFromSearchRef } = useEditor()
  const { setFocusedCell, setMaximizedCellId, getCellsSnapshot } =
    useNotebookActions()
  const { maximizedCellId } = useNotebookState()

  const bufferId = activeBuffer.id
  const maximizedCellIdRef = useRef(maximizedCellId)
  useEffect(() => {
    maximizedCellIdRef.current = maximizedCellId
  }, [maximizedCellId])

  useEffect(() => {
    // Monaco/Metrics reset isNavigatingFromSearchRef on mount; notebooks must too.
    isNavigatingFromSearchRef.current = false

    const applyReveal = () => {
      const request = getPendingReveal()
      if (!request || request.bufferId !== bufferId) return
      if (!getCellsSnapshot().some((cell) => cell.id === request.cellId)) return
      if (
        maximizedCellIdRef.current &&
        maximizedCellIdRef.current !== request.cellId
      ) {
        setMaximizedCellId(null)
      }
      setFocusedCell(request.cellId)
      scrollNotebookCellIntoView(request.cellId)
      // SQL cell matches flash in their own editor (which consumes the request);
      // markdown/chart matches have no in-editor consumer, so clear here.
      if (
        request.notebookField === "chartName" ||
        request.cellType === "markdown"
      ) {
        consumeReveal(request.token)
      }
    }

    applyReveal()
    eventBus.subscribe(EventType.NOTEBOOK_REVEAL_CELL, applyReveal)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_REVEAL_CELL, applyReveal)
  }, [
    bufferId,
    getCellsSnapshot,
    setFocusedCell,
    setMaximizedCellId,
    isNavigatingFromSearchRef,
  ])
}

const NotebookContent: React.FC = () => {
  const {
    cells,
    settings,
    focusedCellId,
    maximizedCellId,
    runningCellIds,
    isHydrating,
  } = useNotebookState()
  const layoutMode = settings.layoutMode ?? "list"
  useScrollRestoredCellIntoView(maximizedCellId)
  useScrollFocusedCellIntoViewOnOpen(focusedCellId, isHydrating)
  useNotebookSearchReveal()
  useChartCellVisibility()
  useCellVirtualizationObserver()

  if (cells.length === 0) {
    return (
      <NotebookWrapper>
        <NotebookToolbar />
        <CellListContainer>
          <NotebookMcpPromo />
          <AddCellBottom alignCenter />
        </CellListContainer>
      </NotebookWrapper>
    )
  }

  const maximizedCell = maximizedCellId
    ? cells.find((c) => c.id === maximizedCellId)
    : undefined
  if (maximizedCell) {
    const cell = maximizedCell
    return (
      <NotebookWrapper>
        <CellListContainer $maximized>
          <CellItem $maximized>
            <CellView
              cell={cell}
              index={cells.indexOf(maximizedCell)}
              totalCells={cells.length}
              layoutMode={layoutMode}
              isFocused={focusedCellId === cell.id}
              isMaximized
              isRunning={runningCellIds.has(cell.id)}
              isHydrating={isHydrating}
            />
          </CellItem>
        </CellListContainer>
      </NotebookWrapper>
    )
  }

  return (
    <NotebookWrapper>
      <NotebookToolbar />
      {layoutMode === "grid" ? <GridLayout /> : <ListLayout />}
    </NotebookWrapper>
  )
}

const SeedFallback = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  height: 100%;
  color: ${color("gray2")};
`

const SEED_SPINNER_DELAY_MS = 200

type SeedError = { message: string; retryable: boolean }

// Seeds from a queued Dexie read instead of the (potentially lagging) React
// buffer object: the queue orders the read behind every committed agent write,
// and the mount claim reroutes later agent ops to the live controller.
export const Notebook: React.FC = () => {
  const { activeBuffer } = useEditor()
  const [seed, setSeed] = useState<NotebookViewState | null>(null)
  const [seedError, setSeedError] = useState<SeedError | null>(null)
  const [seedAttempt, setSeedAttempt] = useState(0)
  const [showSeedSpinner, setShowSeedSpinner] = useState(false)

  const bufferId = typeof activeBuffer.id === "number" ? activeBuffer.id : null
  const isNotebook = !!activeBuffer.notebookViewState
  const archived = !!activeBuffer.archived
  const previewView = activeBuffer.notebookViewState

  const previewSeed = useMemo(
    () =>
      archived && previewView
        ? migratePersistedNotebookView(previewView)
        : null,
    [archived, previewView],
  )

  const retrySeed = () => {
    setSeedAttempt((attempt) => attempt + 1)
  }

  useEffect(() => {
    if (bufferId === null || !isNotebook || archived) return
    let cancelled = false
    setSeedError(null)
    setShowSeedSpinner(false)
    const spinnerTimer = window.setTimeout(() => {
      if (!cancelled) setShowSeedSpinner(true)
    }, SEED_SPINNER_DELAY_MS)
    beginNotebookMount(bufferId).then(
      (result) => {
        if (cancelled) return
        if (result instanceof NotebookToolError) {
          setSeedError({ message: result.message, retryable: false })
        } else {
          setSeed(result)
        }
      },
      () => {
        if (!cancelled) {
          setSeedError({
            message: "Could not load this notebook.",
            retryable: true,
          })
        }
      },
    )
    return () => {
      cancelled = true
      window.clearTimeout(spinnerTimer)
      cancelNotebookMount(bufferId)
    }
  }, [bufferId, isNotebook, archived, seedAttempt])

  if (bufferId === null || !isNotebook) {
    return null
  }

  if (archived) {
    return previewSeed ? (
      <NotebookProvider initialState={previewSeed} bufferId={bufferId} preview>
        <NotebookContent />
      </NotebookProvider>
    ) : null
  }

  if (seedError) {
    return (
      <SeedFallback role="alert" aria-live="assertive" aria-atomic="true">
        <span>{seedError.message}</span>
        {seedError.retryable && (
          <Button skin="secondary" onClick={retrySeed}>
            Retry
          </Button>
        )}
      </SeedFallback>
    )
  }

  if (!seed) {
    return showSeedSpinner ? (
      <SeedFallback role="status" aria-live="polite">
        <LoadingSpinner />
      </SeedFallback>
    ) : null
  }

  return (
    <NotebookProvider initialState={seed} bufferId={bufferId}>
      <NotebookContent />
    </NotebookProvider>
  )
}
