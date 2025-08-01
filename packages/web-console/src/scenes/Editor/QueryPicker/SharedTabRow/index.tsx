import React from "react"
import styled, { css } from "styled-components"
import { FileCode, LineChart, Code } from "@styled-icons/remix-line"
import { ChevronDown, ChevronUp } from "@styled-icons/boxicons-solid"
import { Trash, Edit } from "@styled-icons/boxicons-regular"
import { InsertChart } from "@styled-icons/material"
import { Box, Button } from "@questdb/react-components"
import { useEditor } from "../../../../providers"
import { Text } from "../../../../components"
import { color } from "../../../../utils"
import type { SharedTabWithContent } from "../../../../utils/SharedTabsService"
import { widgets } from "../../Metrics/widgets"
import { MetricType } from "../../Metrics/utils"
import { useSelector } from "react-redux"
import { selectors } from "../../../../store"

type SharedTabRowProps = {
  expanded: boolean
  sharedTab: SharedTabWithContent
  onApplyTab: () => void
  onEditTab?: (tabId: string) => void
  onDeleteTab?: (tabId: string) => void
  setExpanded: (expanded: boolean) => void
}

type SharedQueryRowProps = {
  query: { name?: string; query: string }
  child?: boolean
}

type SharedMetricRowProps = {
  metric: { metricType: MetricType, tableId?: number }
  child?: boolean
}

export type SharedRowProps =
  | (SharedTabRowProps & { type: 'tab' })
  | (SharedQueryRowProps & { type: 'query' })
  | (SharedMetricRowProps & { type: 'metric' })
  | { type: 'empty-placeholder' }

const Wrapper = styled.div<{ $empty?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.05rem solid ${color("black")};
  padding: 0.5rem;
  background: ${color("background")};
  max-width: 100%;
  user-select: none;

  > span:not(:last-child) {
    margin-right: 0.6rem;
  }

  ${({ $empty }) => !$empty && css`
    &:hover {
      background: ${color("selection")}4d;
    }
  `}

  ${({ $empty }) => $empty && `
    height: 3rem;
  `}
`

const Value = styled(Text)`
  flex: 1 1 auto;
  user-select: none;
  max-width: 100%;
  display: block;
`

const FileIcon = styled(FileCode)`
  flex: 0 0 auto;
  margin: 0 0.6rem 0 0;
  color: ${color("foreground")};
`

const CodeIcon = styled(Code)`
  flex: 0 0 auto;
  margin: 0 0.6rem 0 0;
  color: ${color("foreground")};
`

const ChartIcon = styled(LineChart)`
  flex: 0 0 auto;
  margin: 0 0.6rem 0 0;
  color: ${color("cyan")};
`

const MetricsIcon = styled(InsertChart)`
  flex: 0 0 auto;
  margin: 0 0.6rem 0 0;
  color: ${color("cyan")};
`

const Name = styled(Text)`
  display: block;
  justify-content: space-between;
  align-items: center;
  flex: 0 0 auto;
  user-select: none;
  max-width: 100%;
`

const ApplyButton = styled(Button)`
  margin-left: auto;
  margin-right: 0.5rem;
  padding: 0 0.5rem;
  cursor: pointer;
  flex: 0 0 auto;
`

const EditButton = styled(Button)`
  margin-right: 0.5rem;
  padding: 0 0.5rem;
  cursor: pointer;
  flex: 0 0 auto;
`

const DeleteButton = styled(Button)`
  margin-right: 0.5rem;
  padding: 0 0.5rem;
  cursor: pointer;
  flex: 0 0 auto;
`

const SharedRowMeta = ({primaryText, secondaryText, icon, child }: { primaryText?: string, secondaryText?: string, icon?: React.ReactNode, child?: boolean }) => {
  if (primaryText) {
    return (
      <Box align="flex-start" flexDirection="column" gap="0.2rem" margin={child ? "0 0.5rem 0 4.5rem" : "0 0.5rem"} style={{ flex: '1', minWidth: 0 }}>
        <Name color="foreground" size={child ? "sm" : "md"} ellipsis>
          {icon}
          {primaryText}
        </Name>
        <Value color="offWhite" size={child ? "sm" : "md"} ellipsis>
          {secondaryText}
        </Value>
      </Box>
    )
  }

  return (  
    <Box align="flex-start" flexDirection="column" gap="0.2rem" margin={child ? "0 0.5rem 0 4.5rem" : "0 0.5rem"} style={{ flex: '1', minWidth: 0 }}>
      <Name color="offWhite" size={child ? "sm" : "md"} ellipsis>
        {icon}
        {secondaryText}
      </Name>
    </Box>
  )
}

const SharedQueryRow = ({ query, child }: SharedQueryRowProps) => {
  const { appendQuery } = useEditor()
  const queryTrimmed = query.query.endsWith(";") ? query.query.slice(0, -1) : query.query

  return (
    <Wrapper>
      <SharedRowMeta
        primaryText={query.name}
        secondaryText={queryTrimmed}
        icon={<CodeIcon size={child ? "12px" : "16px"} />}
        child={child}
      />
      <ApplyButton
        size="sm"
        skin="secondary"
        onClick={async () => {
          await appendQuery(
            query.name ? `-- ${query.name}\n${query.query}\n` : `${query.query}\n`,
            { appendAt: "end", newTabName: query.name ?? "Query" }
          )
        }}
      >
        Add to editor
      </ApplyButton>
    </Wrapper>
  )
}

const SharedMetricRow = ({ metric, child }: SharedMetricRowProps) => {
  const { appendMetric } = useEditor()
  const tables = useSelector(selectors.query.getTables)

  return (
    <Wrapper>
      <SharedRowMeta
        primaryText={widgets[metric.metricType as MetricType].label}
        secondaryText={tables.find((table) => table.id === metric.tableId)?.table_name || 'No table selected'}
        icon={<ChartIcon size={child ? "12px" : "16px"} />}
        child={child}
      />
      <ApplyButton
        size="sm"
        skin="secondary"
        onClick={() => appendMetric(metric.metricType, metric.tableId)}
      >
        Add to editor
      </ApplyButton>
    </Wrapper>
  )
}

const SharedTabRow = ({ onApplyTab, sharedTab, expanded, setExpanded, onEditTab, onDeleteTab }: SharedTabRowProps) => {
  return (
    <Wrapper onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
      {sharedTab.type &&
        (expanded ? (
          <ChevronUp size="16px" onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
          }} style={{ cursor: "pointer", margin: '0 0.5rem' }} />
        ) : (
          <ChevronDown size="16px" onClick={(e) => {
            e.stopPropagation()
            setExpanded(true)
          }} style={{ cursor: "pointer", margin: '0 0.5rem' }} />
        )
      )}
      <SharedRowMeta
        primaryText={sharedTab.name}
        secondaryText={sharedTab.description || 'No description'}
        icon={sharedTab.type === 'metrics' ? <MetricsIcon size="16px" /> : <FileIcon size="16px" />}
      />
  
      <ApplyButton
        size="sm"
        skin="secondary"
        onClick={(e) => {
          e.stopPropagation()
          onApplyTab()
        }}
      >
        Open tab
      </ApplyButton>
      
      {onEditTab && (
        <EditButton
          size="sm"
          skin="secondary"
          onClick={(e) => {
            e.stopPropagation()
            onEditTab(sharedTab.id)
          }}
          title="Edit shared tab"
        >
          <Edit size="16px" />
        </EditButton>
      )}
      
      {onDeleteTab && (
        <DeleteButton
          size="sm"
          skin="error"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteTab(sharedTab.id)
          }}
          title="Delete shared tab"
        >
          <Trash size="16px" />
        </DeleteButton>
      )}
    </Wrapper>
  )
}

export const SharedRow = (props: SharedRowProps) => {
  if (props.type === 'tab') {
    return <SharedTabRow {...props} />
  }
  if (props.type === 'query') {
    return <SharedQueryRow {...props} />
  }
  if (props.type === 'metric') {
    return <SharedMetricRow {...props} />
  }
  if (props.type === 'empty-placeholder') {
    return <Wrapper $empty={true}>
      <SharedRowMeta
        secondaryText="No items"
        child={true}
      />
    </Wrapper>
  }
  return null
}