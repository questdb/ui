import React, { useRef } from "react"
import styled, { css } from "styled-components"
import { DotsSixVerticalIcon, TrashIcon, XIcon } from "@phosphor-icons/react"
import { useEditor } from "../../providers"
import type { Buffer } from "../../store/buffers"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabRow, type LeadingVisibility } from "./TabRow"
import { BufferIcon } from "./bufferIcon"
import { DeleteRowButton, ROW_ICON_SIZE, RowIconButton } from "./rowActions"
import { useRowDrag, type RowDragState } from "./useRowDrag"
import { isOwnActivationKey } from "./keyboard"
import { displayedIndexDuringDrag } from "../../components/TabBar/tabLayout"
import { useOptimisticOrder } from "../../hooks/useOptimisticOrder"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { sortPinnedBuffers } from "../../utils/buffers/tabOrder"
import { acceptDeleteClick } from "../../utils/buffers/deleteClickGuard"

type Props = {
  buffers: Buffer[]
  reorderable: boolean
}

const DragHandle = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.contentMuted};
  cursor: grab;
`

const RowSlot = styled.div<{ $sorting: boolean; $dragging: boolean }>`
  position: relative;

  ${({ $sorting, $dragging }) =>
    $sorting &&
    !$dragging &&
    css`
      transition: transform 120ms ease-in-out;
    `}

  ${({ $dragging, theme }) =>
    $dragging &&
    css`
      z-index: 2;
      background: ${theme.color.surfaceRaised};
      box-shadow: 0 6px 18px ${theme.color.shadowSoft};
    `}
`

const handleVisibilityFor = (
  drag: RowDragState | null,
  id: number,
): LeadingVisibility => {
  if (!drag) return "auto"
  return drag.id === id ? "visible" : "hidden"
}

const slotStyleFor = (
  drag: RowDragState | null,
  id: number,
  index: number,
): React.CSSProperties | undefined => {
  if (!drag) return undefined
  if (drag.id === id) return { transform: `translateY(${drag.offsetY}px)` }
  const shift =
    displayedIndexDuringDrag(index, drag.fromIndex, drag.toIndex) - index
  return { transform: `translateY(${shift * drag.rowHeight}px)` }
}

export const OpenTabList = ({ buffers, reorderable }: Props) => {
  const {
    buffers: allBuffers,
    activeBuffer,
    setActiveBuffer,
    closeBuffer,
    deleteBuffer,
    reorderBuffer,
  } = useEditor()
  const listRef = useRef<HTMLDivElement>(null)
  const { displayedItems: rows, applyMove } = useOptimisticOrder(
    buffers,
    (buffer) => buffer.id as number,
  )
  const { drag, startDrag, consumeDrop } = useRowDrag({
    listRef,
    rowCount: rows.length,
    onReorder: (id, fromIndex, toIndex) => {
      void trackEvent(ConsoleEvent.TAB_PANEL_REORDER)
      applyMove(fromIndex, toIndex)
      void reorderBuffer(id, toIndex).then(() =>
        eventBus.publish(EventType.TAB_REVEAL, String(id)),
      )
    },
  })

  // `buffers` may be filtered; gate on every open tab so a filter that hides
  // the other tabs does not disable Close/Delete (same rule as closeBuffer).
  const canRemove = sortPinnedBuffers(allBuffers).length > 1

  const activate = (buffer: Buffer) => {
    if (consumeDrop()) return
    void setActiveBuffer(buffer)
  }

  const moveByKeyboard = async (buffer: Buffer, delta: -1 | 1) => {
    if (!reorderable) return
    const fromIndex = rows.findIndex((b) => b.id === buffer.id)
    const toIndex = fromIndex + delta
    if (toIndex < 0 || toIndex >= rows.length) return
    void trackEvent(ConsoleEvent.TAB_PANEL_REORDER)
    applyMove(fromIndex, toIndex)
    await reorderBuffer(buffer.id as number, toIndex)
  }

  const close = async (buffer: Buffer) => {
    void trackEvent(ConsoleEvent.TAB_PANEL_CLOSE)
    await closeBuffer(buffer.id as number)
  }

  const remove = async (buffer: Buffer) => {
    if (!acceptDeleteClick()) return
    void trackEvent(ConsoleEvent.TAB_PANEL_DELETE)
    await deleteBuffer(buffer.id as number)
  }

  const actionsFor = (buffer: Buffer) => (
    <>
      <RowIconButton
        label="Close tab"
        disabled={!canRemove || buffer.isPreviewBuffer}
        data-hook="tabs-panel-close"
        onClick={() => void close(buffer)}
      >
        <XIcon size={ROW_ICON_SIZE} />
      </RowIconButton>
      <DeleteRowButton
        label="Delete tab"
        disabled={!canRemove}
        data-hook="tabs-panel-delete"
        onClick={() => void remove(buffer)}
      >
        <TrashIcon size={ROW_ICON_SIZE} />
      </DeleteRowButton>
    </>
  )

  return (
    <div ref={listRef} role="list" data-hook="tabs-panel-open-list">
      {rows.map((buffer, index) => (
        <RowSlot
          key={buffer.id}
          role="listitem"
          data-hook="tabs-panel-open-row"
          style={slotStyleFor(drag, buffer.id as number, index)}
          $sorting={drag !== null}
          $dragging={drag?.id === buffer.id}
        >
          <TabRow
            label={buffer.label}
            icon={<BufferIcon buffer={buffer} />}
            data-buffer-id={buffer.id}
            active={activeBuffer.id === buffer.id}
            dimmed={false}
            onPointerDown={(event) => {
              const onButton = (event.target as Element).closest("button")
              if (reorderable && !onButton) {
                startDrag(buffer.id as number, index, event)
              }
            }}
            onClick={() => activate(buffer)}
            onKeyDown={(event) => {
              if (isOwnActivationKey(event)) {
                event.preventDefault()
                void setActiveBuffer(buffer)
              }
              if (event.altKey && event.key === "ArrowUp") {
                event.preventDefault()
                void moveByKeyboard(buffer, -1)
              }
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault()
                void moveByKeyboard(buffer, 1)
              }
            }}
            leading={
              reorderable && (
                <DragHandle>
                  <DotsSixVerticalIcon size={14} weight="bold" />
                </DragHandle>
              )
            }
            leadingVisibility={handleVisibilityFor(drag, buffer.id as number)}
            actions={actionsFor(buffer)}
          />
        </RowSlot>
      ))}
    </div>
  )
}
