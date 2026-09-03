import React from "react"
import { CheckmarkOutline, CloseOutline } from "../../../../components/icons"
import { ArrowClockwiseIcon, MinusIcon, Queue } from "@phosphor-icons/react"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { LoadingIconSvg } from "../../Monaco/icons"
import type { StatementSlotView } from "./statementSlotView"
import {
  CancelledIcon,
  Tab,
  TabBarWrapper,
  TabLabel,
  TabSpinner,
  TabStatusIcon,
} from "./styles"

const truncateQuery = (query: string, maxLen = 30): string => {
  const oneLine = query.replace(/\s+/g, " ").trim()
  return oneLine.length > maxLen
    ? oneLine.substring(0, maxLen) + "..."
    : oneLine
}

// A refresh keeps the old rows on screen, so the tab — not the grid — carries
// the refresh state: a spinner while in flight, a red refresh icon when the
// last round failed. A statement with no result yet is neutral, never an error.
const SlotIcon: React.FC<{ slot: StatementSlotView }> = ({ slot }) => {
  if (slot.refreshing || slot.result?.type === "running") {
    return (
      <TabSpinner data-hook="result-tab-loading">
        <LoadingIconSvg />
      </TabSpinner>
    )
  }
  if (slot.refreshError !== undefined) {
    return (
      <TabStatusIcon $success={false} data-hook="result-tab-refresh-error">
        <ArrowClockwiseIcon size={18} />
      </TabStatusIcon>
    )
  }
  if (slot.result === null) {
    return (
      <CancelledIcon data-hook="result-tab-not-run">
        <MinusIcon size={18} />
      </CancelledIcon>
    )
  }
  const { type } = slot.result
  if (type === "queued") {
    return (
      <CancelledIcon data-hook="result-tab-queued">
        <Queue size={18} />
      </CancelledIcon>
    )
  }
  if (type === "cancelled") {
    return (
      <CancelledIcon data-hook="result-tab-cancelled">
        <CloseOutline size="18px" />
      </CancelledIcon>
    )
  }
  return (
    <TabStatusIcon
      $success={type !== "error"}
      data-hook={type === "error" ? "result-tab-error" : "result-tab-success"}
    >
      {type === "error" ? (
        <CloseOutline size="18px" />
      ) : (
        <CheckmarkOutline size="18px" />
      )}
    </TabStatusIcon>
  )
}

type Props = {
  slots: StatementSlotView[]
  activeSlotIndex: number
  onTabChange?: (statementKey: string) => void
}

export const TabBar: React.FC<Props> = ({
  slots,
  activeSlotIndex,
  onTabChange,
}) => (
  <TabBarWrapper role="tablist">
    {slots.map((slot, i) => (
      <Tab
        // Positional identity — duplicate SQL across statements is legal
        // (e.g. `SELECT 1; SELECT 1;`) and would collapse if keyed on query.
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        $active={i === activeSlotIndex}
        onClick={() => {
          if (i !== activeSlotIndex) {
            void trackEvent(ConsoleEvent.NOTEBOOK_RESULT_TAB_SWITCH, {
              tabIndex: i,
              tabCount: slots.length,
              resultType: slot.result?.type ?? "none",
            })
          }
          onTabChange?.(slot.key)
        }}
        title={slot.sql}
        role="tab"
        aria-selected={i === activeSlotIndex}
      >
        <SlotIcon slot={slot} />
        <TabLabel>{truncateQuery(slot.sql)}</TabLabel>
      </Tab>
    ))}
  </TabBarWrapper>
)
