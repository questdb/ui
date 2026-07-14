import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import { CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { color } from "../../../../utils"
import { SafeMarkdown, Button, Tooltip } from "../../../../components"
import type { NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { CellWrapper } from "./CellWrapper"
import { CellDragHeader } from "./CellDragHeader"
import { useCellWrapperInteractions } from "./useCellWrapperInteractions"
import { useCellResize } from "./useCellResize"
import { ResizeHandle } from "../resize"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { ctrlCmd } from "../../../../utils/platform"
import {
  hasAgentVisibleCellHeightChanged,
  MIN_MARKDOWN_HEIGHT_PX,
  snapMarkdownTopHeight,
} from "../notebookUtils"

// The whole cell body shares the editor canvas color so edit and rendered
// modes are one uniform surface (no card-colored gap at the bottom).
const Body = styled.div`
  min-height: 0;
  overflow: auto;
  background: ${color("editorBackground")};
`

// Natural-height wrapper whose measured height feeds the grid row sizing
// (ResizeObserver below). Kept height:auto so it reports CONTENT height even
// when the grid cell stretches the Body around it.
const Measure = styled.div`
  height: auto;
`

const TextArea = styled.textarea`
  display: block;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
  background: transparent;
  color: ${color("foreground")};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 14px;
  line-height: 24px;
  padding: 0.6rem 1.2rem 0.4rem;
  white-space: pre;
  tab-size: 4;

  &::placeholder {
    color: ${color("gray2")};
  }
`

// Rendered markdown: clean prose on the shared editor canvas.
const Rendered = styled.div`
  padding: 1rem 1.2rem 0.6rem;
  color: ${color("foreground")};
  font-family: ${({ theme }) => theme.font};
  font-size: 1.4rem;
  line-height: 2.1rem;
  word-break: break-word;
  cursor: default;

  > :first-child {
    margin-top: 0;
  }
  > :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0 0 1rem 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 1.6rem 0 0.8rem 0;
    font-weight: 600;
    line-height: 1.3;
  }
  h1 {
    font-size: 2.2rem;
  }
  h2 {
    font-size: 1.9rem;
  }
  h3 {
    font-size: 1.6rem;
  }
  h4,
  h5,
  h6 {
    font-size: 1.4rem;
  }

  strong {
    font-weight: 600;
  }
  em {
    font-style: italic;
  }

  a {
    color: ${({ theme }) => theme.color.cyan};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }

  ul,
  ol {
    margin: 0.5rem 0;
    padding-left: 2rem;
  }
  li {
    margin-bottom: 0.3rem;
  }

  code {
    background: ${color("background")};
    border: 1px solid ${color("selection")};
    border-radius: 0.4rem;
    padding: 0.1rem 0.4rem;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: ${color("purple")};
    white-space: pre-wrap;
  }
  pre {
    margin: 1rem 0;
    padding: 1rem 1.2rem;
    background: ${color("background")};
    border: 1px solid ${color("selection")};
    border-radius: 0.6rem;
    overflow-x: auto;
    code {
      background: transparent;
      border: none;
      padding: 0;
      color: ${color("foreground")};
    }
  }

  blockquote {
    border-left: 3px solid ${color("selection")};
    margin: 1rem 0;
    padding-left: 1rem;
    color: ${color("gray2")};
  }

  hr {
    border: none;
    border-top: 1px solid ${color("selection")};
    margin: 1.6rem 0;
  }

  table {
    border-collapse: collapse;
    margin: 1rem 0;
    display: block;
    overflow-x: auto;
  }
  th,
  td {
    padding: 0.6rem 0.8rem;
    border: 1px solid ${color("selection")};
    text-align: left;
  }
  th {
    background: ${color("backgroundDarker")};
    font-weight: 600;
  }
`

const EmptyHint = styled.div`
  padding: 1rem 1.2rem 0.6rem;
  color: ${color("gray2")};
  font-style: italic;
  cursor: default;
`

const CellShell = styled.div`
  position: relative;
`

const PLACEHOLDER = `Write markdown… (${ctrlCmd}+Enter to apply)`
type Props = {
  cell: NotebookCell
  index: number
  totalCells: number
  layoutMode?: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  // Accepted for parity with <Cell/> so markdown can be a drop-in in the
  // render loop; markdown never runs, so these are unused.
  isRunning?: boolean
  isHydrating?: boolean
}

const MarkdownCellInner: React.FC<Props> = ({
  cell,
  index,
  totalCells,
  layoutMode = "list",
  isFocused,
  isMaximized,
}) => {
  const { updateCell } = useNotebookActions()
  const bufferIdForEvents = useNotebookBufferId()

  const { wrapperRef, wrapperHandlers } = useCellWrapperInteractions({
    cellId: cell.id,
    layoutMode,
    isMaximized,
    isFocused,
  })

  // Editing vs rendered is a LOCAL view toggle — never persisted. A freshly
  // added (empty) cell opens in edit mode; a reloaded non-empty cell renders.
  const [editing, setEditing] = useState(() => cell.value.trim() === "")

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const topHeightRef = useRef(cell.topHeight)
  topHeightRef.current = cell.topHeight
  const wasFocusedRef = useRef(isFocused)

  const resetToContentHeight = useCallback(() => {
    const el = measureRef.current
    const next = snapMarkdownTopHeight(
      el ? Math.round(el.getBoundingClientRect().height) : 0,
    )
    if (
      hasAgentVisibleCellHeightChanged(
        cell,
        { topHeight: next, topResized: false },
        layoutMode,
      )
    ) {
      signalUserEdit(bufferIdForEvents)
    }
    updateCell(cell.id, { topHeight: next, topResized: false })
  }, [bufferIdForEvents, cell, layoutMode, updateCell])

  const heightResize = useCellResize(
    MIN_MARKDOWN_HEIGHT_PX,
    useCallback(
      (height: number) =>
        updateCell(cell.id, { topHeight: height, topResized: true }),
      [cell.id, updateCell],
    ),
    resetToContentHeight,
  )

  // The cell value is persisted live as the user types (no separate draft), so
  // nothing is lost if the user navigates away before applying. signalUserEdit
  // bumps the action sequence so a concurrent agent apply detects the change.
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateCell(cell.id, { value: e.target.value })
      signalUserEdit(bufferIdForEvents)
    },
    [cell.id, bufferIdForEvents, updateCell],
  )

  const apply = useCallback(() => {
    setEditing(false)
    emitUserAction({
      kind: "user_updated_cell",
      bufferId: bufferIdForEvents,
      cellId: cell.id,
    })
  }, [bufferIdForEvents, cell.id])

  const edit = useCallback(() => setEditing(true), [])

  // Auto-grow the textarea to its content so there's no inner scrollbar and the
  // measured height reflects the full text.
  useLayoutEffect(() => {
    if (!editing) return
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [editing, cell.value])

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (wasFocusedRef.current && !isFocused && editing) apply()
    wasFocusedRef.current = isFocused
  }, [isFocused, editing, apply])

  // Grid rows are sized from cell.topHeight (computeCellGridH). Markdown has no
  // Monaco content-height feedback, so measure the content and write topHeight.
  // The equality guard (read from a ref to avoid re-subscribing) stops the
  // observe → write → re-render → observe feedback loop.
  useEffect(() => {
    if (layoutMode !== "grid" || isMaximized) return
    if (cell.topResized) return
    const el = measureRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (isMaximized) return
      const measured = Math.round(el.getBoundingClientRect().height)
      if (measured <= 0) return
      const next = snapMarkdownTopHeight(measured)
      if (next === topHeightRef.current) return
      updateCell(cell.id, { topHeight: next })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [cell.id, layoutMode, isMaximized, cell.topResized, updateCell])

  useEffect(() => {
    const handler = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cell.id) return
      heightResize.resetHeight()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
  }, [cell.id, heightResize])

  const isEmpty = cell.value.trim() === ""

  const isGrid = layoutMode === "grid" && !isMaximized
  const listHeight =
    !isGrid && !isMaximized
      ? (heightResize.liveHeight ??
        (cell.topResized ? cell.topHeight : undefined))
      : undefined

  const cellEl = (
    <CellWrapper
      ref={wrapperRef}
      data-cell-id={cell.id}
      tabIndex={-1}
      $focused={isFocused}
      $maximized={isMaximized}
      $gridMode={isGrid}
      {...wrapperHandlers}
    >
      <CellDragHeader
        cellId={cell.id}
        cell={cell}
        cellIndex={index}
        totalCells={totalCells}
        layoutMode={layoutMode}
        isMaximized={isMaximized}
        right={
          editing ? (
            <Tooltip content={`Apply (${ctrlCmd}+Enter)`}>
              <Button skin="transparent" onClick={apply} aria-label="Apply">
                <CheckIcon size={20} />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="Edit">
              <Button skin="transparent" onClick={edit} aria-label="Edit">
                <PencilSimpleIcon size={20} />
              </Button>
            </Tooltip>
          )
        }
      />
      <Body
        ref={bodyRef}
        style={listHeight != null ? { height: listHeight } : undefined}
      >
        <Measure ref={measureRef}>
          {editing ? (
            <TextArea
              ref={textareaRef}
              rows={1}
              value={cell.value}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              onChange={handleChange}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault()
                  e.stopPropagation()
                  apply()
                }
              }}
            />
          ) : isEmpty ? (
            <EmptyHint onDoubleClick={edit}>
              Empty markdown cell — double-click to edit
            </EmptyHint>
          ) : (
            <Rendered onDoubleClick={edit}>
              <SafeMarkdown>{cell.value}</SafeMarkdown>
            </Rendered>
          )}
        </Measure>
      </Body>
    </CellWrapper>
  )

  if (!isGrid && !isMaximized) {
    return (
      <CellShell>
        {cellEl}
        <ResizeHandle
          overlay
          targetRef={bodyRef}
          onResize={heightResize.resizeLive}
          onResizeEnd={heightResize.resizeEnd}
          onDoubleClick={heightResize.resetHeight}
          minHeight={MIN_MARKDOWN_HEIGHT_PX}
        />
      </CellShell>
    )
  }

  return cellEl
}

export const MarkdownCell = React.memo(MarkdownCellInner)
