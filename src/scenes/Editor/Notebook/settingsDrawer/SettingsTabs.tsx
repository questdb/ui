import React from "react"
import styled from "styled-components"
import { TabButton } from "../../../../components"

export const SettingsTabStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

export const SettingsTab = styled(TabButton)`
  && {
    flex: 0 0 auto;
    white-space: nowrap;
    padding: 0.8rem 1.4rem;
    margin-bottom: -1px;
  }
`

type Props<T extends string> = {
  tabs: { id: T; label: React.ReactNode; badge?: React.ReactNode }[]
  active: T
  onChange: (id: T) => void
  ariaLabel: string
}

/** The sections of a settings drawer, as tabs over its body. */
export const SettingsTabs = <T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: Props<T>) => (
  <SettingsTabStrip role="tablist" aria-label={ariaLabel}>
    {tabs.map((tab) => (
      <SettingsTab
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={tab.id === active}
        $active={tab.id === active}
        onClick={() => onChange(tab.id)}
        data-hook={`settings-tab-${tab.id}`}
      >
        {tab.label}
        {tab.badge}
      </SettingsTab>
    ))}
  </SettingsTabStrip>
)
