import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { Button, Input, Text } from "../../../components"
import type { DateRange, DurationPreset } from "./utils"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
`

const Search = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  svg {
    position: absolute;
    left: 0.8rem;
    color: ${({ theme }) => theme.color.contentSecondary};
    pointer-events: none;
  }

  input {
    width: 100%;
    padding-left: 2.8rem;
    padding-right: 2.8rem;
  }
`

const ClearButton = styled(Button).attrs({ variant: "ghost", size: "sm" })`
  && {
    position: absolute;
    right: 0.2rem;
    padding: 0 0.6rem;
  }
`

const List = styled.ul`
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
`

const PresetButton = styled(Button).attrs({
  variant: "ghost",
  size: "sm",
  fullWidth: true,
})<{ $selected: boolean }>`
  && {
    height: 3rem;
    padding: 0 1rem;
    justify-content: flex-start;
    border-radius: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: ${({ $selected, theme }) =>
      $selected ? theme.color.interactionNeutral : "transparent"} !important;
    color: ${({ $selected, theme }) =>
      $selected
        ? theme.color.contentPrimary
        : theme.color.contentSecondary} !important;
  }

  &&:hover:not(:disabled),
  &&:active:not(:disabled),
  &&:focus-visible {
    background: ${({ theme }) => theme.color.interactionNeutral} !important;
    color: ${({ theme }) => theme.color.contentPrimary} !important;
  }

  &&:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.borderAccent};
    outline-offset: -1px;
  }
`

const Empty = styled.div`
  padding: 1rem;
`

const MIN_PRESETS_FOR_SEARCH = 12

type Props = {
  presets: DurationPreset[]
  selected: DateRange | null
  disabled: boolean
  onSelect: (preset: DurationPreset) => void
  dataHook: string
}

export const TimePresetList = ({
  presets,
  selected,
  disabled,
  onSelect,
  dataHook,
}: Props) => {
  const [query, setQuery] = useState("")
  const isSearchable = presets.length >= MIN_PRESETS_FOR_SEARCH
  const listRef = useRef<HTMLUListElement>(null)
  const selectedRef = useRef<HTMLLIElement>(null)
  const needle = isSearchable ? query.trim().toLowerCase() : ""
  const visible = needle
    ? presets.filter((preset) => preset.label.toLowerCase().includes(needle))
    : presets
  const isSelected = (preset: DurationPreset) =>
    selected?.dateFrom === preset.dateFrom && selected?.dateTo === preset.dateTo

  useEffect(() => {
    const list = listRef.current
    const item = selectedRef.current
    if (!list || !item) return
    list.scrollTop =
      item.offsetTop - (list.clientHeight - item.offsetHeight) / 2
  }, [])

  return (
    <Root>
      {isSearchable && (
        <Search>
          <MagnifyingGlassIcon size={14} />
          <Input
            name="time-preset-search"
            aria-label="Search time presets"
            placeholder="Search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-hook={`${dataHook}-search`}
          />
          {query && (
            <ClearButton
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <XIcon size={14} />
            </ClearButton>
          )}
        </Search>
      )}
      <List ref={listRef} role="listbox" aria-label="Quick ranges">
        {visible.map((preset) => (
          <li
            key={preset.label}
            ref={isSelected(preset) ? selectedRef : undefined}
            role="option"
            aria-selected={isSelected(preset)}
          >
            <PresetButton
              type="button"
              data-hook={dataHook}
              $selected={isSelected(preset)}
              aria-pressed={isSelected(preset)}
              disabled={disabled}
              onClick={() => onSelect(preset)}
              title={preset.label}
            >
              {preset.label}
            </PresetButton>
          </li>
        ))}
        {visible.length === 0 && (
          <Empty>
            <Text color="contentSecondary" size="sm">
              No quick ranges match
            </Text>
          </Empty>
        )}
      </List>
    </Root>
  )
}
