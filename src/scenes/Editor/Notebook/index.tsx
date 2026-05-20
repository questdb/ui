import React, { useCallback, useEffect, useMemo } from "react"
import styled from "styled-components"
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  verticalCompactor,
} from "react-grid-layout"
import { absoluteStrategy } from "react-grid-layout/core"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { useEditor } from "../../../providers/EditorProvider"
import type { CellLayoutItem } from "../../../store/notebook"
import { color } from "../../../utils"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
} from "./NotebookProvider"
import { Cell } from "./cells/Cell"
import { AddCellBottom, AddCellBetween } from "./cells/AddCellButton"
import { NotebookToolbar } from "./NotebookToolbar"
import { renderEdgeHandle } from "./resize"
import {
  CELL_CHROME_PX,
  computeCellGridH,
  defaultBottomHeightFor,
  DEFAULT_TOP_HEIGHT,
  generateDefaultLayout as generateDefaultLayoutPure,
  isDoubleView,
  mergeCellLayout,
  MIN_BOTTOM_HEIGHT_PX,
  scaleCellHeights,
} from "./notebookUtils"
import { emitUserAction } from "../../../utils/notebookAIBridge"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const GRID_COLS = 12
// 10 px row increments — fine enough that `computeCellGridH`'s `Math.ceil`
// adds at most 9 px of trailing whitespace per cell (vs. 49 px with the
// previous 50 px rows). Makes drag-resize feel smoother too. All
// row-unit constants below scale up 5× to keep the same pixel-equivalent
// defaults and minimums.
const ROW_HEIGHT = 10
const DEFAULT_CELL_H = 30 // 30 × 10 = 300 px (was 6 × 50 = 300 px)

const NotebookWrapper = styled.div`
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
  background: ${color("editorBackground")};
`

const CellItem = styled.div<{ $maximized?: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  ${({ $maximized }) => $maximized && `flex: 1; min-height: 0;`}
`

type GridCellWrapperProps = React.HTMLAttributes<HTMLDivElement> & {
  cellId: string
}
const GridCellWrapper = React.forwardRef<HTMLDivElement, GridCellWrapperProps>(
  ({ children, style, className, cellId, ...rest }, ref) => (
    <div
      ref={ref}
      data-cell-id={cellId}
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      className={className}
      {...rest}
    >
      {children}
    </div>
  ),
)

const GridScrollContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  background: ${color("editorBackground")};

  .react-grid-item.react-grid-placeholder {
    background: ${color("selection")};
    opacity: 0.25;
  }

  .react-grid-item {
    border-radius: 0.4rem;
  }
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
const GRID_MARGIN_Y = 20
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
  handles: ["se", "s", "e", "w"] as const,
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

const useScrollAddedCellIntoView = (cells: { id: string }[]) => {
  const prev = React.useRef<Set<string>>(new Set(cells.map((c) => c.id)))
  useEffect(() => {
    const added = cells.filter((c) => !prev.current.has(c.id))
    prev.current = new Set(cells.map((c) => c.id))
    if (added.length !== 1) return
    const targetId = added[0].id
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-notebook-cell][data-cell-id="${CSS.escape(targetId)}"]`,
        )
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }, [cells])
}

const ListLayout: React.FC = () => {
  const { cells, focusedCellId, maximizedCellId, runningCellIds } =
    useNotebookState()
  const { setFocusedCell } = useNotebookActions()
  useScrollAddedCellIntoView(cells)

  return (
    <CellListContainer
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (!target.closest("[data-notebook-cell]")) setFocusedCell(null)
      }}
    >
      {cells.map((cell, index) => (
        <React.Fragment key={cell.id}>
          <CellItem>
            <Cell
              cell={cell}
              layoutMode="list"
              isFocused={focusedCellId === cell.id}
              isMaximized={maximizedCellId === cell.id}
              isRunning={runningCellIds.has(cell.id)}
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
  const { cells, settings, focusedCellId, maximizedCellId, runningCellIds } =
    useNotebookState()
  const { setFocusedCell, updateSettings, updateCell } = useNotebookActions()
  const { activeBuffer } = useEditor()
  const { width: containerWidth, containerRef } = useContainerWidth({
    initialWidth: 800,
  })
  useScrollAddedCellIntoView(cells)

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
      const minBottomPx = isDoubleView(cell) ? MIN_BOTTOM_HEIGHT_PX : 0
      const minTotalPx = DEFAULT_TOP_HEIGHT + minBottomPx + CELL_CHROME_PX
      const minH = Math.max(
        MIN_CELL_H,
        Math.ceil((minTotalPx + GRID_MARGIN_Y) / (ROW_HEIGHT + GRID_MARGIN_Y)),
      )
      return {
        ...item,
        h: computeCellGridH(cell, ROW_HEIGHT, GRID_MARGIN_Y),
        minH,
      }
    })
  }, [settings.layout, cells])

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
      updateSettings({ layout: mapLayoutXYW(newLayout) })
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    },
    [mapLayoutXYW, updateSettings, activeBuffer.id],
  )

  const handleResizeStop = useCallback(
    (newLayout: Layout, ..._args: unknown[]) => {
      updateSettings({ layout: mapLayoutXYW(newLayout) })
      const cellById = new Map(cells.map((c) => [c.id, c]))
      for (const item of newLayout) {
        const cell = cellById.get(item.i)
        if (!cell) continue
        const derivedH = computeCellGridH(cell, ROW_HEIGHT, GRID_MARGIN_Y)
        if (item.h === derivedH) continue
        // Rendered px for an h-row cell is `h*rowHeight + (h-1)*marginY`,
        // accounting for the inter-row gaps react-grid-layout inserts.
        // Plain `h * rowHeight` is too small and made the resulting
        // bottomHeight ~marginY-per-row shorter than the user dragged.
        const rowsToPx = (h: number) => h * ROW_HEIGHT + (h - 1) * GRID_MARGIN_Y
        const targetTotalPx = rowsToPx(item.h)
        if (isDoubleView(cell)) {
          const { top: nextTop, bottom: nextBottom } = scaleCellHeights(
            cell.topHeight ?? DEFAULT_TOP_HEIGHT,
            cell.bottomHeight ?? defaultBottomHeightFor(cell),
            targetTotalPx - CELL_CHROME_PX,
            DEFAULT_TOP_HEIGHT,
            MIN_BOTTOM_HEIGHT_PX,
          )
          updateCell(cell.id, {
            topHeight: nextTop,
            bottomHeight: nextBottom,
            topResized: true,
          })
        } else {
          // Single-view: no bottom slot — south drag grows the editor.
          // Mark topResized so Monaco's content-driven auto-grow stops
          // snapping the cell back to MIN_EDITOR_HEIGHT after the user's
          // drag. Without this, the dragged size only lingered in rgl's
          // internal state and disappeared on the next layouts-prop
          // reconciliation (e.g. when another cell was added).
          const nextTopHeight = Math.max(
            DEFAULT_TOP_HEIGHT,
            targetTotalPx - CELL_CHROME_PX,
          )
          updateCell(cell.id, {
            topHeight: nextTopHeight,
            topResized: true,
          })
        }
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
      {/* No `key` on ResponsiveGridLayout: keying it on cellIds would
       * unmount every Cell/DrawCanvas on add/remove and wipe chart state.
       * rgl reconciles children by their own key matched against
       * layouts.lg[].i. */}
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
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        positionStrategy={absoluteStrategy}
      >
        {cells.map((cell) => (
          <GridCellWrapper key={cell.id} cellId={cell.id}>
            <Cell
              cell={cell}
              layoutMode="grid"
              isFocused={focusedCellId === cell.id}
              isMaximized={maximizedCellId === cell.id}
              isRunning={runningCellIds.has(cell.id)}
            />
          </GridCellWrapper>
        ))}
      </ResponsiveGridLayout>
      <AddCellBottom
        afterCellId={cells.length > 0 ? cells[cells.length - 1].id : undefined}
      />
    </GridScrollContainer>
  )
}

const NotebookContent: React.FC = () => {
  const { cells, settings, focusedCellId, maximizedCellId, runningCellIds } =
    useNotebookState()
  const layoutMode = settings.layoutMode ?? "list"

  if (cells.length === 0) {
    return (
      <NotebookWrapper>
        <NotebookToolbar />
        <CellListContainer>
          <AddCellBottom alignCenter />
        </CellListContainer>
      </NotebookWrapper>
    )
  }

  if (maximizedCellId) {
    const cell = cells.find((c) => c.id === maximizedCellId)
    if (!cell) return null

    return (
      <NotebookWrapper>
        <CellListContainer $maximized>
          <CellItem $maximized>
            <Cell
              cell={cell}
              layoutMode="list"
              isFocused={focusedCellId === cell.id}
              isMaximized
              isRunning={runningCellIds.has(cell.id)}
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

export const Notebook: React.FC = () => {
  const { activeBuffer } = useEditor()

  if (!activeBuffer.notebookViewState || !activeBuffer.id) {
    return null
  }

  return (
    <NotebookProvider
      initialState={activeBuffer.notebookViewState}
      bufferId={activeBuffer.id}
    >
      <NotebookContent />
    </NotebookProvider>
  )
}
