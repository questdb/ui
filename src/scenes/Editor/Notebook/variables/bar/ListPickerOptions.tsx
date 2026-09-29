import React, { forwardRef, useRef, useState } from "react"
import styled from "styled-components"
import { CheckIcon } from "@phosphor-icons/react"
import {
  VirtualizedTree,
  type VirtualizedTreeHandle,
} from "../../../../../components/VirtualizedTree"
import { menuItemStyles } from "../../../../../components/menuStyles"
import type { VariableOption } from "../../../../../store/notebook"
import type { ListSelection } from "./listSelection"

export type PickerOption = {
  id: string
  option: VariableOption | null
  stale: boolean
}

type Props = {
  items: PickerOption[]
  selected: ListSelection
  multi: boolean
  label: string
  id: string
  searchRef: React.RefObject<HTMLInputElement>
  onSearch: (edit: (query: string) => string) => void
  onSelect: (item: PickerOption) => void
}

const ITEM_HEIGHT_REM = 3.2
const MAX_HEIGHT_REM = 32

const Item = styled.div`
  ${menuItemStyles}
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.8rem;
  gap: 0.8rem;
  height: ${ITEM_HEIGHT_REM}rem;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const ItemLabel = styled.span<{ $stale: boolean }>`
  min-width: 0;
  overflow: hidden;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $stale, theme }) =>
    $stale ? theme.color.contentMuted : "inherit"};
`

const SelectionIcon = styled(CheckIcon)`
  color: ${({ theme }) => theme.color.contentAccent};
`

export const ListPickerOptions = forwardRef<VirtualizedTreeHandle, Props>(
  (
    { items, selected, multi, label, id, searchRef, onSearch, onSelect },
    ref,
  ) => {
    const selectedValues = new Set(
      selected === "all" ? [] : selected.map((option) => option.value),
    )
    const isSelected = (item: PickerOption) =>
      item.option === null
        ? selected === "all"
        : selectedValues.has(item.option.value)
    const [focusedIndex, setFocusedIndex] = useState<number | null>(() =>
      Math.max(0, items.findIndex(isSelected)),
    )
    const treeRef = useRef<VirtualizedTreeHandle | null>(null)
    const initialIndex = useRef(Math.max(0, (focusedIndex ?? 0) - 1))
    const activeIndex =
      focusedIndex === null ? null : Math.min(focusedIndex, items.length - 1)

    const selectItem = (item: PickerOption) => {
      treeRef.current?.focus()
      onSelect(item)
    }

    const handleKeyDown = (
      item: PickerOption,
      index: number,
      event: React.KeyboardEvent,
    ) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        selectItem(item)
      } else if (event.key === "ArrowUp" && index === 0 && searchRef.current) {
        event.preventDefault()
        searchRef.current.focus()
      } else if (searchRef.current) {
        if (event.key === "Backspace") {
          event.preventDefault()
          onSearch((query) => query.slice(0, -1))
          searchRef.current.focus()
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault()
          onSearch((query) => query + event.key)
          searchRef.current.focus()
        }
      }
    }

    return (
      <VirtualizedTree
        ref={(tree) => {
          treeRef.current = tree
          if (typeof ref === "function") ref(tree)
          else if (ref) ref.current = tree
        }}
        items={items}
        focusedIndex={activeIndex}
        setFocusedIndex={setFocusedIndex}
        initialTopMostItemIndex={initialIndex.current}
        navigateWithTab={false}
        accessibilityProps={{
          role: "listbox",
          "aria-label": label,
          "aria-multiselectable": multi,
          "aria-activedescendant":
            activeIndex === null ? undefined : `${id}-${activeIndex}`,
        }}
        style={{
          height: `${Math.min(items.length * ITEM_HEIGHT_REM, MAX_HEIGHT_REM)}rem`,
        }}
        onItemClick={selectItem}
        onItemKeyDown={handleKeyDown}
        renderItem={(item, index, focused) => (
          <Item
            id={`${id}-${index}`}
            role="option"
            data-hook="variable-list-option"
            aria-selected={isSelected(item)}
            aria-posinset={index + 1}
            aria-setsize={items.length}
            data-highlighted={focused ? "" : undefined}
          >
            <ItemLabel $stale={item.stale}>
              {item.option?.label ?? "All"}
              {item.stale ? " (not in current values)" : ""}
            </ItemLabel>
            {isSelected(item) && <SelectionIcon size={16} weight="bold" />}
          </Item>
        )}
      />
    )
  },
)
