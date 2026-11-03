import React from "react"
import styled from "styled-components"
import { SelectMenu } from "../../../../components"
import {
  AUTO_REFRESH_OPTIONS,
  autoRefreshLabel,
  isAutoRefresh,
} from "../notebookUtils"
import { OverrideDot } from "../refreshSplitButton"
import { CustomIntervalInput } from "./CustomIntervalInput"
import type { AutoRefresh } from "../../../../store/notebook"

// Radix RadioGroup keys on strings; every option stringifies uniquely
// ("true"/"false"/"5s"/…), so the round-trip is lossless.
const optionKey = (option: AutoRefresh): string => String(option)

const INHERIT_KEY = "inherit"

const fromKey = (key: string): AutoRefresh | undefined => {
  if (key === INHERIT_KEY) return undefined
  if (key === "true") return true
  if (key === "false") return false
  return isAutoRefresh(key) ? key : true
}

// A custom interval in use joins the list, so the menu shows it as checked.
const optionsWith = (value: AutoRefresh | undefined): AutoRefresh[] =>
  value === undefined || AUTO_REFRESH_OPTIONS.includes(value)
    ? AUTO_REFRESH_OPTIONS
    : [...AUTO_REFRESH_OPTIONS, value]

const OptionsGroup = styled(SelectMenu.RadioGroup)`
  min-width: 20rem;
`

type Props = {
  value: AutoRefresh | undefined
  onSelect: (value: AutoRefresh | undefined) => void
  // Closes the menu after a custom interval, which no menu item selects.
  onClose: () => void
  inheritedValue?: AutoRefresh
}

export const AutoRefreshOptions: React.FC<Props> = ({
  value,
  onSelect,
  onClose,
  inheritedValue,
}) => (
  <OptionsGroup
    value={value === undefined ? INHERIT_KEY : optionKey(value)}
    onValueChange={(key) => onSelect(fromKey(key))}
  >
    {inheritedValue !== undefined && (
      <>
        <SelectMenu.Item
          value={INHERIT_KEY}
          indicator={value !== undefined ? <OverrideDot /> : undefined}
        >
          {`Notebook default (${autoRefreshLabel(inheritedValue)})`}
        </SelectMenu.Item>
        <SelectMenu.Divider />
      </>
    )}
    {optionsWith(value).map((option) => (
      <SelectMenu.Item key={optionKey(option)} value={optionKey(option)}>
        {autoRefreshLabel(option)}
      </SelectMenu.Item>
    ))}
    <CustomIntervalInput
      onApply={(interval) => {
        onSelect(interval)
        onClose()
      }}
    />
  </OptionsGroup>
)
