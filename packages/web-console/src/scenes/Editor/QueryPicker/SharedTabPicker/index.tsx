import React, { useCallback, useState, useMemo } from "react"
import styled from "styled-components"
import { Button } from "@questdb/react-components"
import { color } from "../../../../utils"
import { toast } from "../../../../components/Toast"
import { VirtualList } from "../../../../components/VirtualList"
import { useEditor } from "../../../../providers"
import type { SharedTabWithContent } from "../../../../utils/SharedTabsService"
import { Plus } from "@styled-icons/boxicons-regular"
import { SharedRow, SharedRowProps } from "../SharedTabRow"

type Props = {
  hidePicker: () => void
  sharedTabs: SharedTabWithContent[]
  openCategorySelection: () => void
  onEditTab: (tabId: string) => void
  onDeleteTab: (tabId: string) => void
}

const StyledVirtualList = styled(VirtualList)`
  display: flex;
  max-height: 650px;
  width: 600px;
  max-width: 600px;
  padding: 0.6rem 0;
  flex-direction: column;
  background: ${color("backgroundDarker")};
  box-shadow: ${color("black")} 0px 5px 8px;
  border: 1px solid ${color("black")};
  border-radius: 4px;
`

const AddSharedTabButton = styled(Button)`
  padding: 1rem 0;
  border-radius: 0;
  border-bottom: 0.05rem solid ${color("black")};
  width: 100%;
  height: 5rem;

  &:hover {
    background: ${color("selection")}4d !important;
  }
`

const formatErrorMessage = (error: unknown, context?: string): string => {
  const prefix = context ? `${context}: ` : ""
  
  if (error instanceof Error) {
    return `${prefix}${error.message}`
  }
  
  if (typeof error === 'string') {
    return `${prefix}${error}`
  }
  
  return `${prefix}An unexpected error occurred`
}

const SharedTabPicker = ({ hidePicker, sharedTabs, openCategorySelection, onEditTab, onDeleteTab }: Props) => {
  const { addBuffer, sharedTabsService } = useEditor()
  const [expandedTabs, setExpandedTabs] = useState<Map<string, boolean>>(new Map())

  const isTabExpanded = useCallback((tabId: string) => expandedTabs.get(tabId) ?? false, [expandedTabs])
  const toggleTabExpansion = useCallback((tabId: string, expanded: boolean) => setExpandedTabs(prev => new Map(prev).set(tabId, expanded)), [expandedTabs])

  const applySharedTab = useCallback(
    async (sharedTab: SharedTabWithContent) => {
      try {
        const buffer = sharedTabsService?.createBufferFromSharedTab(sharedTab)
        if (buffer) {
          await addBuffer(buffer)
          hidePicker()
        }
      } catch (error) {
        console.error('Error applying shared tab:', error)
        toast.error(formatErrorMessage(error, "Failed to apply shared tab"))
      }
    },
    [hidePicker, addBuffer, sharedTabsService],
  )

  const flattenedSharedTabs = useMemo(() => {
    const allItems: Array<SharedRowProps & { key: string }> = []
    for (const tab of sharedTabs) {
      if (tab.type === 'query') {
        allItems.push({ sharedTab: tab, onApplyTab: () => applySharedTab(tab), onEditTab, onDeleteTab, key: tab.id, type: 'tab', expanded: isTabExpanded(tab.id), setExpanded: (expanded) => toggleTabExpansion(tab.id, expanded) })

        if (expandedTabs.get(tab.id)) {
          if (tab.queries.length === 0) {
            allItems.push({ key: `${tab.id}-empty-placeholder`, type: 'empty-placeholder' })
          }
          tab.queries.forEach((query, index) => {
            allItems.push({
              query: { name: query.name, query: query.query },
              child: true,
              key: `${tab.id}-${query.query}-${index}`,
              type: 'query'
            })
          })
        }

      } else {
        allItems.push({ sharedTab: tab, onApplyTab: () => applySharedTab(tab), onEditTab, onDeleteTab, key: tab.id, type: 'tab', expanded: isTabExpanded(tab.id), setExpanded: (expanded) => toggleTabExpansion(tab.id, expanded) })

        if (expandedTabs.get(tab.id)) {
          if (tab.metrics.length === 0) {
            allItems.push({ key: `${tab.id}-empty-placeholder`, type: 'empty-placeholder' })
          }
          tab.metrics.forEach((metric) => {
            allItems.push({
              metric: {
                metricType: metric.metricType,
                tableId: metric.tableId
              },
              child: true,
              key: `${tab.id}-${metric.metricType}-${metric.position}`,
              type: 'metric'
            })
          })
        }

      }
    }
    return allItems
  }, [sharedTabs, expandedTabs, onEditTab, onDeleteTab, applySharedTab, isTabExpanded, toggleTabExpansion])

  return (
    <StyledVirtualList
      height={650}
      itemContent={(index) => {
        if (index === 0) {
          return (
            <AddSharedTabButton
              skin="transparent"
              onClick={() => {
                openCategorySelection()
                hidePicker()
              }}
              prefixIcon={<Plus size="16px" />}
              title="Create a new shared tab"
            >
              Add shared tab
            </AddSharedTabButton>
          )
        }

        const { key, ...props } = flattenedSharedTabs[index - 1]
        return <SharedRow key={key} {...props} />
      }}
      totalCount={flattenedSharedTabs.length + 1}
    />
  )
}

export default SharedTabPicker