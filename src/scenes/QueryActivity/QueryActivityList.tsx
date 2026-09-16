import React from "react"
import styled from "styled-components"
import { VirtualList } from "../../components/VirtualList"
import { QueryActivityRow } from "./QueryActivityRow"
import type {
  QueryActivityItem,
  QueryActivityRow as Row,
} from "./queryActivity"

type Props = {
  items: QueryActivityItem[]
  onOpenInEditor: (row: Row) => void
  onCancel: (row: Row) => void
  onHoldChange: (queryId: bigint, held: boolean) => void
  onFadeEnd: (queryId: bigint) => void
}

const List = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
`

export const QueryActivityList = ({
  items,
  onOpenInEditor,
  onCancel,
  onHoldChange,
  onFadeEnd,
}: Props) => (
  <List data-hook="query-activity-list">
    <VirtualList
      height="100%"
      totalCount={items.length}
      computeItemKey={(index) => items[index].row.queryId.toString()}
      itemContent={(index) => {
        const item = items[index]
        return (
          <QueryActivityRow
            item={item}
            onOpenInEditor={() => onOpenInEditor(item.row)}
            onCancel={() => onCancel(item.row)}
            onHoldChange={(held) => onHoldChange(item.row.queryId, held)}
            onFadeEnd={() => onFadeEnd(item.row.queryId)}
          />
        )
      }}
    />
  </List>
)
