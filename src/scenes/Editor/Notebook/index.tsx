import React, { useCallback, useMemo } from "react"
import styled from "styled-components"
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  verticalCompactor,
} from "react-grid-layout"
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
  generateDefaultLayout as generateDefaultLayoutPure,
  mergeCellLayout,
} from "./notebookUtils"
import { emitUserAction } from "../../../utils/notebookAIBridge"

const GRID_COLS = 12
const ROW_HEIGHT = 50
const DEFAULT_CELL_H = 6

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

const GridCellWrapper = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, style, className, ...rest }, ref) => (
  <div
    ref={ref}
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
))

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

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: ${color("comment")};
`

const MIN_CELL_W = 2
// 4 rows × 50 px ≈ 200 px — below this the inner editor↔result resizer is
// clipped, hiding the result table.
const MIN_CELL_H = 4

const GRID_MARGIN: [number, number] = [20, 20]
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

const ListLayout: React.FC = () => {
  const { cells, focusedCellId, maximizedCellId, runningCellIds } =
    useNotebookState()
  const { setFocusedCell } = useNotebookActions()

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
  const { setFocusedCell, updateSettings } = useNotebookActions()
  const { activeBuffer } = useEditor()
  const { width: containerWidth, containerRef } = useContainerWidth({
    initialWidth: 800,
  })

  const currentLayout = useMemo<LayoutItem[]>(
    () =>
      mergeCellLayout(
        settings.layout && settings.layout.length > 0
          ? settings.layout
          : generateDefaultLayout(cells),
        cells,
        LAYOUT_OPTS,
      ) as LayoutItem[],
    [settings.layout, cells],
  )

  const mapLayout = useCallback(
    (rglLayout: Layout): CellLayoutItem[] =>
      [...rglLayout]
        .filter((item: LayoutItem) => cells.some((c) => c.id === item.i))
        .map((item: LayoutItem) => ({
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        })),
    [cells],
  )

  // Persist on drag/resize stop only — onLayoutChange fires per drag tick
  // and would thrash persistence.
  const handleDragStop = useCallback(
    (newLayout: Layout, ..._args: unknown[]) => {
      updateSettings({ layout: mapLayout(newLayout) })
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    },
    [mapLayout, updateSettings, activeBuffer.id],
  )

  const handleResizeStop = useCallback(
    (newLayout: Layout, ..._args: unknown[]) => {
      updateSettings({ layout: mapLayout(newLayout) })
      if (typeof activeBuffer.id === "number") {
        emitUserAction({
          kind: "user_changed_grid_layout",
          bufferId: activeBuffer.id,
        })
      }
    },
    [mapLayout, updateSettings, activeBuffer.id],
  )

  return (
    <GridScrollContainer
      ref={containerRef as React.RefObject<HTMLDivElement>}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (!target.closest("[data-notebook-cell]")) setFocusedCell(null)
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
      >
        {cells.map((cell) => (
          <GridCellWrapper key={cell.id}>
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
          <EmptyState>No cells yet</EmptyState>
          <AddCellBottom />
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
