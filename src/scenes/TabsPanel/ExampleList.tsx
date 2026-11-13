import React from "react"
import styled from "styled-components"
import { NotebookIcon } from "@phosphor-icons/react"
import { LoadingSpinner } from "../../components"
import { useEditor } from "../../providers"
import type { ExampleDashboard } from "../../providers/SettingsProvider/types"
import { TabRow } from "./TabRow"
import { isOwnActivationKey } from "./keyboard"

type Props = {
  examples: ExampleDashboard[]
}

const Icon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.statusInfo};
`

// Ready-made notebooks from console-configuration.json. One click opens a
// dashboard; the row stands for the opened notebook, so it is the one shown as
// active while that notebook is the active tab.
export const ExampleList = ({ examples }: Props) => {
  const {
    activeBuffer,
    buffers,
    openExampleDashboard,
    openingExampleIds,
    tabsDisabled,
  } = useEditor()
  // Read the link from the live rows: a rename detaches the notebook from its
  // example at once, and the cached activeBuffer would lag behind.
  const activeTemplateId = buffers.find(
    (b) => b.id === activeBuffer.id,
  )?.templateId

  const open = (example: ExampleDashboard) => {
    if (openingExampleIds.includes(example.id)) return
    void openExampleDashboard(example)
  }

  return (
    <div role="list" data-hook="tabs-panel-example-list">
      {examples.map((example) => {
        const opening = openingExampleIds.includes(example.id)
        return (
          <div key={example.id} role="listitem">
            <TabRow
              label={example.title}
              icon={
                <Icon>
                  <NotebookIcon size={16} />
                </Icon>
              }
              active={activeTemplateId === example.id}
              disabled={tabsDisabled}
              dimmed={false}
              meta={
                opening && (
                  <LoadingSpinner size="1.4rem" color="contentSecondary" />
                )
              }
              aria-busy={opening || undefined}
              data-example-id={example.id}
              onClick={() => open(example)}
              onKeyDown={(event) => {
                if (isOwnActivationKey(event)) {
                  event.preventDefault()
                  open(example)
                }
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
