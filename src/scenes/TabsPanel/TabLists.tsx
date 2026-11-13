import React from "react"
import styled from "styled-components"
import { Text } from "../../components"
import { useEditor, useSettings } from "../../providers"
import { hasExampleDashboards } from "../../utils/examples/hasExampleDashboards"
import {
  sortClosedBuffers,
  sortPinnedBuffers,
} from "../../utils/buffers/tabOrder"
import { TabSection } from "./TabSection"
import { TabGroupList } from "./TabGroupList"
import { OpenTabList } from "./OpenTabList"
import { ExampleList } from "./ExampleList"
import { buildTabGroups, groupCountLabel, matchesFilter } from "./tabGroups"

export type ViewMode = "groups" | "list"

type Props = {
  filter: string
  includeClosed: boolean
  viewMode: ViewMode
}

const Lists = styled.div`
  padding: 1rem 0;
`

const Empty = styled.div`
  padding: 0.6rem 1rem 0.6rem 2.5rem;
`

export const TabLists = ({ filter, includeClosed, viewMode }: Props) => {
  const { buffers, activeBuffer } = useEditor()
  const activeTemplateId = buffers.find(
    (buffer) => buffer.id === activeBuffer.id,
  )?.templateId
  const { consoleConfig } = useSettings()

  const hasExamples = hasExampleDashboards(consoleConfig)
  const examples = hasExamples
    ? consoleConfig.exampleDashboards!.filter((example) =>
        matchesFilter(example.title, filter),
      )
    : []
  const groups = buildTabGroups(buffers, { includeClosed, filter })

  // List mode mirrors the tab bar: every open tab in bar order (examples
  // included, once open), then closed tabs. Examples that are not open have
  // no tab, so they are not listed.
  const userTabs = buffers.filter(
    (buffer) => !buffer.isPreviewBuffer && matchesFilter(buffer.label, filter),
  )
  const openTabs = sortPinnedBuffers(userTabs)
  const closedTabs = sortClosedBuffers(userTabs)

  return (
    <Lists>
      {viewMode === "groups" ? (
        <React.Fragment key="groups">
          {hasExamples && (
            <TabSection
              title="Example dashboards"
              count={String(examples.length)}
              activeTabId={
                examples.some((example) => example.id === activeTemplateId)
                  ? activeBuffer.id
                  : undefined
              }
              data-hook="tabs-panel-examples"
            >
              {examples.length === 0 ? (
                <Empty>
                  <Text color="contentSecondary">No examples match</Text>
                </Empty>
              ) : (
                <ExampleList examples={examples} />
              )}
            </TabSection>
          )}
          {groups.map((group) => (
            <TabSection
              key={group.type}
              title={group.title}
              count={groupCountLabel(group, includeClosed)}
              activeTabId={
                group.rows.some((buffer) => buffer.id === activeBuffer.id)
                  ? activeBuffer.id
                  : undefined
              }
              // With examples configured the panel is a showcase: keep
              // the visitor's eye on the examples and fold the rest.
              defaultExpanded={!hasExamples}
              data-hook={`tabs-panel-group-${group.type.toLowerCase()}`}
            >
              <TabGroupList rows={group.rows} />
            </TabSection>
          ))}
          {groups.length === 0 && !hasExamples && (
            <Empty data-hook="tabs-panel-empty">
              <Text color="contentSecondary">
                {filter.trim() === "" ? "No tabs" : "No tabs match"}
              </Text>
            </Empty>
          )}
        </React.Fragment>
      ) : (
        <React.Fragment key="list">
          <TabSection
            title="Open"
            count={String(openTabs.length)}
            activeTabId={
              openTabs.some((buffer) => buffer.id === activeBuffer.id)
                ? activeBuffer.id
                : undefined
            }
            data-hook="tabs-panel-open"
          >
            {openTabs.length === 0 ? (
              <Empty>
                <Text color="contentSecondary">No open tabs match</Text>
              </Empty>
            ) : (
              <OpenTabList
                buffers={openTabs}
                reorderable={filter.trim() === ""}
              />
            )}
          </TabSection>
          <TabSection
            title="Closed"
            count={String(closedTabs.length)}
            activeTabId={
              closedTabs.some((buffer) => buffer.id === activeBuffer.id)
                ? activeBuffer.id
                : undefined
            }
            data-hook="tabs-panel-closed"
          >
            {closedTabs.length === 0 ? (
              <Empty>
                <Text color="contentSecondary">
                  {filter.trim() === ""
                    ? "No closed tabs"
                    : "No closed tabs match"}
                </Text>
              </Empty>
            ) : (
              <TabGroupList rows={closedTabs} />
            )}
          </TabSection>
        </React.Fragment>
      )}
    </Lists>
  )
}
