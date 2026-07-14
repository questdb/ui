import React from "react"
import { DropdownMenu } from "../../../../components"
import { AUTO_REFRESH_OPTIONS, autoRefreshLabel } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"

// Radix RadioGroup keys on strings; every option stringifies uniquely
// ("true"/"false"/"5s"/…), so the round-trip is lossless.
const optionKey = (option: AutoRefresh): string => String(option)

const fromKey = (key: string): AutoRefresh =>
  AUTO_REFRESH_OPTIONS.find((option) => optionKey(option) === key) ?? true

type Props = {
  value: AutoRefresh
  onSelect: (value: AutoRefresh) => void
}

export const AutoRefreshOptions: React.FC<Props> = ({ value, onSelect }) => (
  <DropdownMenu.RadioGroup
    value={optionKey(value)}
    onValueChange={(key) => onSelect(fromKey(key))}
  >
    {AUTO_REFRESH_OPTIONS.map((option) => (
      <DropdownMenu.RadioItem key={optionKey(option)} value={optionKey(option)}>
        {autoRefreshLabel(option)}
      </DropdownMenu.RadioItem>
    ))}
  </DropdownMenu.RadioGroup>
)
