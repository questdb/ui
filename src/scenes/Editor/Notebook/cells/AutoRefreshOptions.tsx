import React from "react"
import styled from "styled-components"
import { SelectMenu } from "../../../../components"
import { AUTO_REFRESH_OPTIONS, autoRefreshLabel } from "../notebookUtils"
import { OverrideDot } from "../refreshSplitButton"
import type { AutoRefresh } from "../../../../store/notebook"

// Radix RadioGroup keys on strings; every option stringifies uniquely
// ("true"/"false"/"5s"/…), so the round-trip is lossless.
const optionKey = (option: AutoRefresh): string => String(option)

const INHERIT_KEY = "inherit"

const fromKey = (key: string): AutoRefresh | undefined =>
  key === INHERIT_KEY
    ? undefined
    : (AUTO_REFRESH_OPTIONS.find((option) => optionKey(option) === key) ?? true)

const OptionsGroup = styled(SelectMenu.RadioGroup)`
  min-width: 20rem;
`

type Props = {
  value: AutoRefresh | undefined
  onSelect: (value: AutoRefresh | undefined) => void
  inheritedValue?: AutoRefresh
}

export const AutoRefreshOptions: React.FC<Props> = ({
  value,
  onSelect,
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
    {AUTO_REFRESH_OPTIONS.map((option) => (
      <SelectMenu.Item key={optionKey(option)} value={optionKey(option)}>
        {autoRefreshLabel(option)}
      </SelectMenu.Item>
    ))}
  </OptionsGroup>
)
