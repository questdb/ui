import React, { useMemo } from "react"
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react"
import { format, formatDistance } from "date-fns"
import { Tooltip } from "../../components"
import { useEditor } from "../../providers"
import type { Buffer } from "../../store/buffers"
import { fetchUserLocale, getLocaleFromLanguage } from "../../utils"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabRow } from "./TabRow"
import { DeleteRowButton, ROW_ICON_SIZE, RowIconButton } from "./rowActions"

type Props = {
  buffers: Buffer[]
}

export const ClosedTabList = ({ buffers }: Props) => {
  const { activeBuffer, previewBuffer, restoreBuffer, deleteBuffer } =
    useEditor()
  const locale = useMemo(() => getLocaleFromLanguage(fetchUserLocale()), [])

  const preview = (buffer: Buffer) => previewBuffer(buffer.id as number)

  const reopen = async (buffer: Buffer) => {
    void trackEvent(ConsoleEvent.TAB_PANEL_RESTORE)
    await restoreBuffer(buffer.id as number)
  }

  const remove = async (buffer: Buffer) => {
    void trackEvent(ConsoleEvent.TAB_PANEL_DELETE)
    await deleteBuffer(buffer.id as number)
  }

  const closedAgo = (buffer: Buffer) =>
    buffer.archivedAt ? (
      <span title={format(buffer.archivedAt, "P pppp", { locale })}>
        {formatDistance(buffer.archivedAt, Date.now(), { locale })} ago
      </span>
    ) : undefined

  const actionsFor = (buffer: Buffer) => (
    <>
      <Tooltip content="Reopen" placement="right">
        <RowIconButton
          label="Reopen tab"
          data-hook="tabs-panel-reopen"
          onClick={() => void reopen(buffer)}
        >
          <ArrowCounterClockwiseIcon size={ROW_ICON_SIZE} />
        </RowIconButton>
      </Tooltip>
      <DeleteRowButton
        label="Delete tab"
        data-hook="tabs-panel-delete"
        onClick={() => void remove(buffer)}
      >
        <TrashIcon size={ROW_ICON_SIZE} />
      </DeleteRowButton>
    </>
  )

  return (
    <div role="list" data-hook="tabs-panel-closed-list">
      {buffers.map((buffer) => (
        <TabRow
          key={buffer.id}
          role="listitem"
          buffer={buffer}
          active={activeBuffer.id === buffer.id}
          dimmed={!buffer.isTemporary}
          meta={closedAgo(buffer)}
          onClick={() => void preview(buffer)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              void preview(buffer)
            }
          }}
          actions={actionsFor(buffer)}
        />
      ))}
    </div>
  )
}
