import React from "react"
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { Queue } from "@phosphor-icons/react"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import { LoadingIconSvg } from "../../Monaco/icons"
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

const StatusIcon: React.FC<{ type: SingleQueryResult["type"] }> = ({
  type,
}) => {
  if (type === "running") {
    return (
      <TabSpinner>
        <LoadingIconSvg />
      </TabSpinner>
    )
  }
  if (type === "queued") {
    return (
      <CancelledIcon>
        <Queue size={18} />
      </CancelledIcon>
    )
  }
  if (type === "cancelled") {
    return (
      <CancelledIcon>
        <CloseOutline size="18px" />
      </CancelledIcon>
    )
  }
  return (
    <TabStatusIcon $success={type !== "error"}>
      {type === "error" ? (
        <CloseOutline size="18px" />
      ) : (
        <CheckmarkOutline size="18px" />
      )}
    </TabStatusIcon>
  )
}

type Props = {
  result: CellResult
  onTabChange?: (index: number) => void
}

export const TabBar: React.FC<Props> = ({ result, onTabChange }) => (
  <TabBarWrapper role="tablist">
    {result.results.map((r, i) => (
      <Tab
        // Positional identity — duplicate SQL across statements is legal
        // (e.g. `SELECT 1; SELECT 1;`) and would collapse if keyed on query.
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        $active={i === result.activeResultIndex}
        onClick={() => onTabChange?.(i)}
        title={r.query}
        role="tab"
        aria-selected={i === result.activeResultIndex}
      >
        <StatusIcon type={r.type} />
        <TabLabel>{truncateQuery(r.query)}</TabLabel>
      </Tab>
    ))}
  </TabBarWrapper>
)
