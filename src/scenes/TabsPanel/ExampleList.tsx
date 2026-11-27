import React from "react"
import { LoadingSpinner } from "../../components"
import { useEditor } from "../../providers"
import type { ExampleDashboard } from "../../providers/SettingsProvider/types"
import { TabRow } from "./TabRow"
import { NotebookTabIcon } from "./bufferIcon"
import { isOwnActivationKey } from "./keyboard"

type Props = {
  examples: ExampleDashboard[]
  // The example whose notebook is the active tab.
  activeTemplateId: string | undefined
}

// Ready-made notebooks from console-configuration.json. One click opens a
// dashboard; the row stands for the opened notebook, so it is the one shown as
// active while that notebook is the active tab.
export const ExampleList = ({ examples, activeTemplateId }: Props) => {
  const { openExampleDashboard, openingExampleIds, tabsDisabled } = useEditor()

  const open = (example: ExampleDashboard) => {
    if (openingExampleIds.includes(example.id)) return
    void openExampleDashboard(example)
  }

  return (
    <div data-hook="tabs-panel-example-list">
      {examples.map((example) => {
        const opening = openingExampleIds.includes(example.id)
        return (
          <div key={example.id}>
            <TabRow
              label={example.title}
              icon={<NotebookTabIcon />}
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
