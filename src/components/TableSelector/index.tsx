import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import styled from "styled-components"
import * as RadixPopover from "@radix-ui/react-popover"
import Highlighter from "react-highlight-words"
import { XIcon } from "@phosphor-icons/react"
import { TableIcon } from "../../scenes/Schema/table-icon"
import type { PartitionBy } from "../../utils/questdb"
import {
  VirtualizedTree,
  type VirtualizedTreeHandle,
  type VirtualizedTreeItem,
} from "../VirtualizedTree"
import { IconButton } from "../IconButton"
import { floatingSurfaceStyles } from "../overlayStyles"

export type TableOption = {
  label: string
  value: string
  kind?: "table" | "matview" | "view"
  disabled?: boolean
  walEnabled?: boolean
  partitionBy?: PartitionBy
  designatedTimestamp?: string
}

type TableTreeItem = TableOption & VirtualizedTreeItem

type Props = {
  options: TableOption[]
  titleDataHook?: string
  onSelect: (value: string, option: TableOption) => void
  value?: string
  placeholder?: string
  prefix?: React.ReactNode
  className?: string
  defaultOpen?: boolean
}

const ITEM_HEIGHT_REM = 3
const MAX_LIST_HEIGHT_REM = 30

const TriggerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  overflow: hidden;
  position: relative;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  padding: 0.1rem 0.5rem;
  cursor: pointer;

  &:hover,
  &:focus-within {
    border-color: ${({ theme }) => theme.color.borderDefault};
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const TriggerInput = styled.input<{ $isOpen: boolean }>`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentPrimary};
  background: transparent;
  border: none;
  outline: none;
  min-width: ${({ $isOpen }) => ($isOpen ? "16rem" : "0")};
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: ${({ $isOpen }) => ($isOpen ? "text" : "pointer")};
  padding: 0;
  padding-right: ${({ $isOpen }) => ($isOpen ? "2rem" : "0")};

  &::placeholder {
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const DropdownContent = styled(RadixPopover.Content)`
  ${floatingSurfaceStyles}
  display: flex;
  flex-direction: column;
  z-index: 9999;
  width: 30rem;
  max-width: calc(100vw - 1.6rem);
  padding: 0.4rem;
  overflow: hidden;
`

const ClearButton = styled(IconButton)`
  position: absolute;
  right: 0;
`

const Item = styled.div<{ $active: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  height: ${ITEM_HEIGHT_REM}rem;
  padding: 0.5rem 1rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: ${({ theme }) => theme.fontSize.md};
  border-radius: 0.4rem;
  white-space: nowrap;
  min-width: 0;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.color.contentDisabled : theme.color.contentPrimary};
  background: ${({ $active, theme }) =>
    $active ? theme.color.interactionNeutral : "transparent"};
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.color.borderDefault : "transparent"};

  &:hover {
    background: ${({ $disabled, $active, theme }) =>
      $disabled
        ? "transparent"
        : $active
          ? theme.color.interactionNeutral
          : theme.color.interactionHover};
  }

  .highlight {
    background-color: ${({ theme, $disabled }) =>
      $disabled
        ? `${theme.color.interactionNeutral}80`
        : theme.color.interactionNeutral};
    color: ${({ theme, $disabled }) =>
      $disabled ? theme.color.contentDisabled : theme.color.contentPrimary};
  }
`

const ItemLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`

const NoResults = styled.div`
  padding: 1.2rem;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const TableSelector = ({
  options,
  titleDataHook,
  onSelect,
  value = "",
  placeholder = "Select a table",
  prefix,
  className,
  defaultOpen = false,
}: Props) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<VirtualizedTreeHandle>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const hasDefaultOpened = useRef(false)

  const displayValue = open ? query : value
  const displayPlaceholder = open ? "Select a table" : placeholder

  const sorted = useMemo(
    () =>
      [...options].sort((a, b) =>
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
      ),
    [options],
  )

  const filtered: TableTreeItem[] = useMemo(() => {
    if (!query) return sorted.map((o) => ({ ...o, id: o.value }))
    const q = query.toLowerCase()
    const prefixMatches: TableOption[] = []
    const substringMatches: TableOption[] = []
    for (const o of sorted) {
      const lower = o.label.toLowerCase()
      if (lower.startsWith(q)) {
        prefixMatches.push(o)
      } else if (lower.includes(q)) {
        substringMatches.push(o)
      }
    }
    return [...prefixMatches, ...substringMatches].map((o) => ({
      ...o,
      id: o.value,
    }))
  }, [sorted, query])

  const handleSelect = useCallback(
    (option: TableOption) => {
      if (option.disabled) return
      onSelect(option.value, option)
      setOpen(false)
      setQuery("")
      setFocusedIndex(null)
    },
    [onSelect],
  )

  const handleTreeSetFocusedIndex = useCallback(
    (index: number | null) => {
      setFocusedIndex(open && index === null ? 0 : index)
    },
    [open],
  )

  const focusTree = useCallback(() => {
    const focusable =
      treeContainerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')
    focusable?.focus()
  }, [])

  const focusInput = useCallback(() => {
    setFocusedIndex(0)
    inputRef.current?.focus()
  }, [])

  const handleOpen = useCallback(() => {
    if (!open) {
      setOpen(true)
    }
  }, [])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false)
      setQuery("")
      setFocusedIndex(null)
    }
  }, [])

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
          e.preventDefault()
          handleOpen()
        }
        return
      }
      if (e.key === "ArrowDown" && filtered.length > 0) {
        e.preventDefault()
        setFocusedIndex((prev) =>
          prev !== null && prev < filtered.length - 1 ? prev + 1 : 0,
        )
        focusTree()
      } else if (e.key === "ArrowUp" && filtered.length > 0) {
        e.preventDefault()
        setFocusedIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : filtered.length - 1,
        )
        focusTree()
      } else if (
        e.key === "Enter" &&
        focusedIndex !== null &&
        focusedIndex >= 0
      ) {
        e.preventDefault()
        const item = filtered[focusedIndex]
        if (item && !item.disabled) {
          handleSelect(item)
          inputRef.current?.blur()
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        if (query) {
          setQuery("")
          setFocusedIndex(0)
        } else {
          setOpen(false)
          setQuery("")
          setFocusedIndex(null)
          inputRef.current?.blur()
        }
      }
    },
    [open, filtered, focusedIndex, handleSelect, focusTree, handleOpen],
  )

  const handleItemKeyDown = useCallback(
    (item: TableTreeItem, index: number, e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" && index === 0) {
        e.preventDefault()
        focusInput()
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        handleSelect(item)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
        setQuery("")
        setFocusedIndex(null)
        return
      }
      // Printable character → redirect to input
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setQuery((prev) => prev + e.key)
        focusInput()
        return
      }
      if (e.key === "Backspace") {
        e.preventDefault()
        setQuery((prev) => prev.slice(0, -1))
        focusInput()
      }
    },
    [handleSelect, focusInput],
  )

  const handleItemClick = useCallback(
    (item: TableTreeItem) => {
      handleSelect(item)
    },
    [handleSelect],
  )

  const renderItem = useCallback(
    (item: TableTreeItem, _index: number, isFocused: boolean) => (
      <Item
        $active={isFocused}
        $disabled={item.disabled}
        data-hook="table-selector-item"
      >
        <TableIcon
          kind={item.kind ?? "table"}
          walEnabled={item.walEnabled}
          partitionBy={item.partitionBy}
          designatedTimestamp={item.designatedTimestamp}
        />
        <ItemLabel>
          <Highlighter
            highlightClassName="highlight"
            searchWords={[query]}
            textToHighlight={item.label}
            autoEscape
          />
        </ItemLabel>
      </Item>
    ),
    [query],
  )

  // Open on mount if defaultOpen
  useEffect(() => {
    if (defaultOpen && !hasDefaultOpened.current) {
      hasDefaultOpened.current = true
      setOpen(true)
    }
  }, [defaultOpen])

  // Focus input and highlight first item when popover opens
  useEffect(() => {
    if (open) {
      setFocusedIndex(0)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open])

  const listHeight = `${Math.min(filtered.length * ITEM_HEIGHT_REM, MAX_LIST_HEIGHT_REM)}rem`

  return (
    <RadixPopover.Root open={open} onOpenChange={handleOpenChange}>
      <RadixPopover.Anchor asChild>
        <TriggerContainer
          ref={triggerRef}
          className={className}
          onClick={handleOpen}
          data-hook="table-selector-trigger"
        >
          {prefix}
          <TriggerInput
            ref={inputRef}
            $isOpen={open}
            value={displayValue}
            readOnly={!open}
            placeholder={displayPlaceholder}
            size={Math.max(
              1,
              (displayValue || displayPlaceholder || "").length,
            )}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocusedIndex(0)
            }}
            onKeyDown={handleInputKeyDown}
            data-hook={titleDataHook ?? "table-selector-input"}
          />
          {open && query && (
            <ClearButton
              label="Clear table search"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setQuery("")
                setFocusedIndex(0)
                inputRef.current?.focus()
              }}
              data-hook="table-selector-clear"
            >
              <XIcon size={16} />
            </ClearButton>
          )}
        </TriggerContainer>
      </RadixPopover.Anchor>
      {open && (
        <RadixPopover.Portal>
          <DropdownContent
            align="start"
            sideOffset={4}
            data-hook="table-selector-dropdown"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (triggerRef.current?.contains(e.target as Node)) {
                e.preventDefault()
              }
            }}
          >
            {filtered.length === 0 ? (
              <NoResults>
                {query ? "No tables matched the filter" : "No tables"}
              </NoResults>
            ) : (
              <div ref={treeContainerRef} style={{ height: listHeight }}>
                <VirtualizedTree
                  ref={treeRef}
                  items={filtered}
                  renderItem={renderItem}
                  focusedIndex={focusedIndex}
                  setFocusedIndex={handleTreeSetFocusedIndex}
                  onItemClick={handleItemClick}
                  onItemKeyDown={handleItemKeyDown}
                />
              </div>
            )}
          </DropdownContent>
        </RadixPopover.Portal>
      )}
    </RadixPopover.Root>
  )
}
