import React, { useMemo } from "react"
import {
  ArrowCounterClockwiseIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { format, formatDistance } from "date-fns"
import { Tooltip } from "../../components"
import { useEditor } from "../../providers"
import type { Buffer } from "../../store/buffers"
import { fetchUserLocale, getLocaleFromLanguage } from "../../utils"
import { sortPinnedBuffers } from "../../utils/buffers/tabOrder"
import { acceptDeleteClick } from "../../utils/buffers/deleteClickGuard"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabRow } from "./TabRow"
import { BufferIcon } from "./bufferIcon"
import { DeleteRowButton, ROW_ICON_SIZE, RowIconButton } from "./rowActions"
import { focusNeighbourRow, isOwnActivationKey } from "./keyboard"

type Props = {
  // Open tabs first, then closed ones (see buildTabGroups).
  rows: Buffer[]
}

export const TabGroupList = ({ rows }: Props) => {
  const {
    buffers,
    activeBuffer,
    setActiveBuffer,
    closeBuffer,
    deleteBuffer,
    previewBuffer,
    restoreBuffer,
  } = useEditor()
  const locale = useMemo(() => getLocaleFromLanguage(fetchUserLocale()), [])

  // Gate on every open tab, not the rows shown: a filter that hides the other
  // tabs must not disable Close/Delete (same rule as closeBuffer).
  const canRemove = sortPinnedBuffers(buffers).length > 1

  const activate = (buffer: Buffer) =>
    buffer.archived
      ? previewBuffer(buffer.id as number)
      : setActiveBuffer(buffer)

  // The panel keeps keyboard focus: the neighbouring row takes it, and the
  // editor is not focused when the tab goes away.
  const close = async (buffer: Buffer, action: Element) => {
    void trackEvent(ConsoleEvent.TAB_PANEL_CLOSE)
    focusNeighbourRow(action)
    await closeBuffer(buffer.id as number, { focusEditor: false })
  }

  const reopen = async (buffer: Buffer) => {
    void trackEvent(ConsoleEvent.TAB_PANEL_RESTORE)
    await restoreBuffer(buffer.id as number)
  }

  const remove = async (buffer: Buffer, action: Element) => {
    if (!acceptDeleteClick()) return
    void trackEvent(ConsoleEvent.TAB_PANEL_DELETE)
    focusNeighbourRow(action)
    await deleteBuffer(buffer.id as number, true, "user", {
      focusEditor: false,
    })
  }

  const closedAgo = (buffer: Buffer) =>
    buffer.archived && buffer.archivedAt ? (
      <span title={format(buffer.archivedAt, "P pppp", { locale })}>
        {formatDistance(buffer.archivedAt, Date.now(), { locale })} ago
      </span>
    ) : undefined

  const actionsFor = (buffer: Buffer) => (
    <>
      {buffer.archived ? (
        <Tooltip content="Reopen" placement="right">
          <RowIconButton
            label="Reopen tab"
            data-hook="tabs-panel-reopen"
            onClick={() => void reopen(buffer)}
          >
            <ArrowCounterClockwiseIcon size={ROW_ICON_SIZE} />
          </RowIconButton>
        </Tooltip>
      ) : (
        <RowIconButton
          label="Close tab"
          disabled={!canRemove}
          data-hook="tabs-panel-close"
          onClick={(event) => void close(buffer, event.currentTarget)}
        >
          <XIcon size={ROW_ICON_SIZE} />
        </RowIconButton>
      )}
      <DeleteRowButton
        label="Delete tab"
        disabled={!buffer.archived && !canRemove}
        data-hook="tabs-panel-delete"
        onClick={(event) => void remove(buffer, event.currentTarget)}
      >
        <TrashIcon size={ROW_ICON_SIZE} />
      </DeleteRowButton>
    </>
  )

  return (
    <div role="list" data-hook="tabs-panel-list">
      {rows.map((buffer) => (
        <div
          key={buffer.id}
          role="listitem"
          data-hook={
            buffer.archived ? "tabs-panel-closed-row" : "tabs-panel-open-row"
          }
        >
          <TabRow
            label={buffer.label}
            icon={<BufferIcon buffer={buffer} />}
            active={activeBuffer.id === buffer.id}
            dimmed={buffer.archived === true && !buffer.isTemporary}
            meta={closedAgo(buffer)}
            data-buffer-id={buffer.id}
            onClick={() => void activate(buffer)}
            onKeyDown={(event) => {
              if (isOwnActivationKey(event)) {
                event.preventDefault()
                void activate(buffer)
              }
            }}
            actions={actionsFor(buffer)}
          />
        </div>
      ))}
    </div>
  )
}
