import React, { useState, useRef, useEffect, useMemo } from "react"
import styled from "styled-components"
import * as RadixPopover from "@radix-ui/react-popover"
import { CheckIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { ButtonBase } from "../Button"
import { IconButton } from "../IconButton"
import { Input } from "../Input"
import { SelectMenuTriggerButton } from "../SelectMenu"
import { menuContainerStyles, menuItemStyles } from "../menuStyles"

export type SearchableSelectOption = {
  label: string
  value: string
  disabled?: boolean
}

type ListItem<O extends SearchableSelectOption> = SearchableSelectOption & {
  option: O | null
  create?: boolean
}

export type SearchableSelectVariant = "inline" | "field"

type Props<O extends SearchableSelectOption> = {
  options: O[]
  // Text shown while closed; selection reports the option's value.
  value: string
  // Controlled multi-selection; value remains the closed trigger label.
  selectedValues?: string[]
  onSelect: (value: string, option: O | null) => void
  // Clearing controlled state is required for the built-in Reset action.
  onReset: () => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  noMatchLabel?: string
  clearLabel?: string
  // Enter creates a typed name at the top while it remains selected.
  // Custom names are reported with option null.
  allowCustom?: boolean
  renderItemPrefix?: (option: O) => React.ReactNode
  variant?: SearchableSelectVariant
  prefix?: React.ReactNode
  className?: string
  defaultOpen?: boolean
  dataHookBase?: string
  inputDataHook?: string
  ariaLabel?: string
  ariaInvalid?: boolean
}

const ITEM_HEIGHT_REM = 3.2
const MAX_LIST_HEIGHT_REM = 25.6
let nextId = 0

const FieldTrigger = styled(SelectMenuTriggerButton)`
  &&,
  &&:hover:not(:disabled):not([aria-disabled="true"]),
  &&[aria-expanded="true"] {
    background: ${({ theme }) => theme.color.surfaceInput};
  }

  &&[aria-invalid="true"] {
    border-color: ${({ theme }) => theme.color.statusDangerStrong};
  }
`

const InlineTrigger = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  position: relative;
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

const InlineInput = styled.input<{ $isOpen: boolean }>`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentPrimary};
  background: transparent;
  border: none;
  outline: none;
  flex: 0 1 auto;
  min-width: ${({ $isOpen }) => ($isOpen ? "16rem" : "0")};
  text-overflow: ellipsis;
  cursor: ${({ $isOpen }) => ($isOpen ? "text" : "pointer")};
  padding: 0;
  padding-right: ${({ $isOpen }) => ($isOpen ? "2rem" : "0")};

  &::placeholder {
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const DropdownContent = styled(RadixPopover.Content)<{ $field: boolean }>`
  ${menuContainerStyles}
  width: ${({ $field }) =>
    $field ? "max(30rem, var(--radix-popover-trigger-width))" : "30rem"};
  max-width: calc(100vw - 2rem);
  max-height: var(--radix-popover-content-available-height);
  overflow: hidden;
`

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-shrink: 0;
  margin: 0 0.4rem 0.6rem;
`

const SearchField = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
  min-width: 0;

  > svg {
    position: absolute;
    left: 0.8rem;
    color: ${({ theme }) => theme.color.contentSecondary};
    pointer-events: none;
  }
`

const ResetButton = styled(ButtonBase)`
  flex-shrink: 0;
  padding: 0.4rem 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  margin-right: 0.8rem;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.contentPrimary};
    text-decoration: underline;
  }

  &:disabled {
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

const SearchInput = styled(Input)`
  width: 100%;
  height: 3.2rem;
  padding: 0 3rem;
  font-size: 1.3rem;
  border-radius: 0.4rem;
`

const ClearButton = styled(IconButton).attrs({ tabIndex: -1 })`
  position: absolute;
  right: 0.2rem;
`

const Item = styled.div`
  ${menuItemStyles}
  height: ${ITEM_HEIGHT_REM}rem;
  padding: 0.7rem 0.8rem;
  gap: 0.8rem;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;

  &:hover:not([data-disabled]) {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const ItemLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`

const Indicator = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentAccent};
`

const NoResults = styled.div`
  padding: 0.7rem 0.8rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const SearchableSelect = <O extends SearchableSelectOption>({
  options,
  value,
  selectedValues,
  onSelect,
  onReset,
  placeholder = "Select an option",
  searchPlaceholder = "Search options",
  emptyLabel = "No options",
  noMatchLabel = "No options matched the filter",
  clearLabel = "Clear search",
  allowCustom = false,
  renderItemPrefix,
  variant = "inline",
  prefix,
  className,
  defaultOpen = false,
  dataHookBase = "searchable-select",
  inputDataHook,
  ariaLabel,
  ariaInvalid,
}: Props<O>) => {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState("")
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [listId] = useState(() => `searchable-select-${++nextId}`)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<VirtuosoHandle>(null)
  const inlineRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const field = variant === "field"
  const multiple = selectedValues !== undefined
  const hasSelection = multiple ? selectedValues.length > 0 : value !== ""
  const inputPlaceholder = allowCustom
    ? `${searchPlaceholder} (Enter to add)`
    : searchPlaceholder
  const isSelected = (item: ListItem<O>) =>
    !item.create &&
    (selectedValues
      ? selectedValues.includes(item.value)
      : item.label === value)

  const filtered = useMemo(() => {
    const sorted: ListItem<O>[] = [...options]
      .sort((a, b) =>
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
      )
      .map((option) => ({ ...option, option }))
    // Derive custom options from the controlled selection so deselecting one
    // removes it immediately, including when the selection changes externally.
    const names = selectedValues ?? (value ? [value] : [])
    const custom: ListItem<O>[] = allowCustom
      ? names
          .filter(
            (name) =>
              !options.some((option) =>
                multiple ? option.value === name : option.label === name,
              ),
          )
          .map((name) => ({ label: name, value: name, option: null }))
      : []
    const all = [...custom, ...sorted]
    const trimmed = query.trim()
    if (!trimmed) return all
    const q = trimmed.toLowerCase()
    const matches = all.filter((item) => item.label.toLowerCase().includes(q))
    if (allowCustom && !all.some((item) => item.label === trimmed)) {
      matches.unshift({
        label: trimmed,
        value: trimmed,
        option: null,
        create: true,
      })
    }
    return matches
  }, [options, selectedValues, multiple, allowCustom, value, query])

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    setQuery("")
    setFocusedIndex(null)
  }

  const selectItem = (item: ListItem<O>) => {
    if (item.disabled) return
    onSelect(item.value, item.option)
    if (multiple) {
      setQuery("")
      setFocusedIndex(null)
      inputRef.current?.focus()
      if (item.create) listRef.current?.scrollToIndex({ index: 0 })
    } else {
      changeOpen(false)
    }
  }

  useEffect(() => {
    if (open) {
      setFocusedIndex(null)
      listRef.current?.scrollToIndex({ index: 0 })
    }
  }, [query, open])

  useEffect(() => {
    if (open && focusedIndex !== null) {
      listRef.current?.scrollIntoView({ index: focusedIndex })
    }
  }, [focusedIndex, open])

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (!open) {
      if (["Enter", "ArrowDown", " "].includes(event.key)) {
        event.preventDefault()
        changeOpen(true)
      }
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      let index = focusedIndex ?? (direction === 1 ? -1 : 0)
      for (let step = 0; step < filtered.length; step++) {
        index = (index + direction + filtered.length) % filtered.length
        if (!filtered[index].disabled) {
          setFocusedIndex(index)
          break
        }
      }
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item =
        focusedIndex === null
          ? (filtered.find((entry) => entry.label === query.trim()) ??
            filtered.find((entry) => !entry.disabled))
          : filtered[focusedIndex]
      if (item) selectItem(item)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (query) {
        setQuery("")
      } else {
        changeOpen(false)
      }
    } else if (event.key === "Tab") {
      if (hasSelection && !event.shiftKey) return
      if (field) triggerRef.current?.focus()
      changeOpen(false)
    }
  }

  const inputProps = {
    ref: inputRef,
    role: "combobox",
    "aria-label": ariaLabel ?? searchPlaceholder,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant":
      focusedIndex !== null ? `${listId}-${focusedIndex}` : undefined,
    "aria-autocomplete": "list" as const,
    autoComplete: "off",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
      setFocusedIndex(null)
    },
    onKeyDown: handleInputKeyDown,
    "data-hook": inputDataHook ?? `${dataHookBase}-input`,
  }

  const resetButton = (
    <ResetButton
      disabled={!hasSelection}
      data-hook={`${dataHookBase}-reset`}
      onClick={(event) => {
        event.stopPropagation()
        onReset()
        setQuery("")
        setFocusedIndex(null)
        listRef.current?.scrollToIndex({ index: 0 })
        inputRef.current?.focus()
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab" && !event.shiftKey) {
          if (field) triggerRef.current?.focus()
          else inputRef.current?.focus()
          changeOpen(false)
        }
      }}
    >
      Reset
    </ResetButton>
  )

  return (
    <RadixPopover.Root open={open} onOpenChange={changeOpen}>
      {field ? (
        <RadixPopover.Trigger asChild>
          <FieldTrigger
            ref={triggerRef}
            className={className}
            label={value || placeholder}
            leadingIcon={prefix}
            labelFontSize="1.2rem"
            fullWidth
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            dataHook={`${dataHookBase}-trigger`}
          />
        </RadixPopover.Trigger>
      ) : (
        <RadixPopover.Anchor asChild>
          <InlineTrigger
            ref={inlineRef}
            className={className}
            onClick={() => {
              if (!open) changeOpen(true)
            }}
            data-hook={`${dataHookBase}-trigger`}
          >
            {prefix}
            <SearchField>
              <InlineInput
                {...inputProps}
                $isOpen={open}
                value={open ? query : value}
                readOnly={!open}
                placeholder={open ? inputPlaceholder : placeholder}
                size={Math.max(
                  1,
                  (open ? query || inputPlaceholder : value || placeholder)
                    .length,
                )}
              />
              {open && query && (
                <ClearButton
                  label={clearLabel}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    setQuery("")
                    inputRef.current?.focus()
                  }}
                  data-hook={`${dataHookBase}-clear`}
                >
                  <XIcon size={14} />
                </ClearButton>
              )}
            </SearchField>
            {open && resetButton}
          </InlineTrigger>
        </RadixPopover.Anchor>
      )}
      {open && (
        <RadixPopover.Portal>
          <DropdownContent
            $field={field}
            align="start"
            sideOffset={4}
            data-hook={`${dataHookBase}-dropdown`}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              inputRef.current?.focus()
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (query) setQuery("")
              else changeOpen(false)
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              // Restore focus only if it was not moved to another control.
              if (document.activeElement === document.body) {
                if (field) triggerRef.current?.focus()
                else inputRef.current?.focus()
              }
            }}
            onInteractOutside={(event) => {
              if (inlineRef.current?.contains(event.target as Node))
                event.preventDefault()
            }}
          >
            {field && (
              <SearchRow>
                <SearchField>
                  <MagnifyingGlassIcon size={16} aria-hidden="true" />
                  <SearchInput
                    {...inputProps}
                    value={query}
                    placeholder={inputPlaceholder}
                  />
                  {query && (
                    <ClearButton
                      label={clearLabel}
                      size="sm"
                      onClick={() => {
                        setQuery("")
                        inputRef.current?.focus()
                      }}
                      data-hook={`${dataHookBase}-clear`}
                    >
                      <XIcon size={14} />
                    </ClearButton>
                  )}
                </SearchField>
                {resetButton}
              </SearchRow>
            )}
            <div
              id={listId}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              aria-label={ariaLabel ?? placeholder}
              style={{
                minHeight: 0,
                height: `${Math.min(Math.max(1, filtered.length) * ITEM_HEIGHT_REM, MAX_LIST_HEIGHT_REM)}rem`,
              }}
            >
              {filtered.length === 0 ? (
                <NoResults role="status">
                  {query ? noMatchLabel : emptyLabel}
                </NoResults>
              ) : (
                <Virtuoso
                  ref={listRef}
                  data={filtered}
                  computeItemKey={(_index, item) =>
                    `${item.option === null ? "custom" : "option"}:${item.value}`
                  }
                  style={{ height: "100%" }}
                  itemContent={(index, item) => (
                    <Item
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={isSelected(item)}
                      aria-disabled={item.disabled || undefined}
                      aria-posinset={index + 1}
                      aria-setsize={filtered.length}
                      data-highlighted={focusedIndex === index ? "" : undefined}
                      data-disabled={item.disabled ? "" : undefined}
                      data-hook={`${dataHookBase}-item`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectItem(item)}
                    >
                      {item.option && renderItemPrefix?.(item.option)}
                      <ItemLabel>
                        {item.create ? `Add “${item.label}”` : item.label}
                      </ItemLabel>
                      <Indicator>
                        {isSelected(item) && (
                          <CheckIcon size={16} weight="bold" />
                        )}
                      </Indicator>
                    </Item>
                  )}
                />
              )}
            </div>
          </DropdownContent>
        </RadixPopover.Portal>
      )}
    </RadixPopover.Root>
  )
}
