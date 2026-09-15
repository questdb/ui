import React, { useRef, useState } from "react"
import styled from "styled-components"
import * as RadixPopover from "@radix-ui/react-popover"
import { formatDistanceToNow } from "date-fns"
import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react"
import {
  IconButton,
  Input,
  SelectMenuTriggerButton,
  Text,
} from "../../../../../components"
import { menuContainerStyles } from "../../../../../components/menuStyles"
import type { VirtualizedTreeHandle } from "../../../../../components/VirtualizedTree"
import { ListPickerOptions, type PickerOption } from "./ListPickerOptions"
import type {
  ListVariable,
  VariableOption,
} from "../../../../../store/notebook"
import { MAX_OPTIONS } from "../options/normalizeQueryOptions"
import type { VariableOptionsState } from "../useVariableOptions"
import {
  sameSelection,
  toggleOption,
  type ListSelection,
} from "./listSelection"
import { PickerLabel } from "./PickerLabel"

const SEARCH_THRESHOLD = 8

const Trigger = styled(SelectMenuTriggerButton)`
  min-width: 16rem;
  max-width: 28rem;
`

const ErrorMark = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.statusDanger};
`

const SearchBox = styled.div`
  padding: 0.4rem 0.6rem 0.6rem;
  input {
    width: 100%;
  }
`

const Content = styled(RadixPopover.Content)`
  ${menuContainerStyles}
  width: 28rem;
  max-width: calc(100vw - 1.6rem);
`

const Empty = styled.div`
  padding: 0.6rem 0.8rem;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-top: 0.4rem;
  padding: 0.6rem 0.4rem 0.2rem 0.8rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

type SelectionDraft = { base: ListSelection; selection: ListSelection }

const summarize = (
  selected: ListSelection,
  options: VariableOption[],
): string => {
  if (selected === "all") return "All"
  if (selected.length === 0) return "None selected"
  if (selected.length <= 2) return selected.map((o) => o.label).join(", ")
  return `${selected.length} of ${options.length}`
}

const describeStatus = (status: VariableOptionsState): string => {
  if (status.status === "loading") return "Loading values..."
  if (status.status === "error") return status.error ?? "Could not load values"
  const count = `${status.options.length.toLocaleString()} value${
    status.options.length === 1 ? "" : "s"
  }`
  const truncated = status.truncated
    ? `, first ${MAX_OPTIONS.toLocaleString()}`
    : ""
  const when = status.fetchedAt
    ? `, ${formatDistanceToNow(status.fetchedAt, { addSuffix: true })}`
    : ""
  return `${count}${truncated}${when}`
}

const matches = (option: VariableOption, query: string): boolean =>
  option.label.toLowerCase().includes(query) ||
  option.value.toLowerCase().includes(query)

type Props = {
  variable: ListVariable
  options: VariableOption[]
  status?: VariableOptionsState
  onChange: (selected: ListVariable["selected"]) => void
  onRefresh?: () => void
}

export const ListPicker = ({
  variable,
  options,
  status,
  onChange,
  onRefresh,
}: Props) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<SelectionDraft | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<VirtualizedTreeHandle>(null)

  const current =
    draft !== null && draft.base === variable.selected
      ? draft.selection
      : variable.selected
  const selected = current === "all" ? [] : current
  const known = new Set(options.map((o) => o.value))
  const stale = selected.filter((o) => !known.has(o.value))
  const listed = [...options, ...stale]
  const lowered = query.trim().toLowerCase()
  const visible = lowered
    ? listed.filter((option) => matches(option, lowered))
    : listed
  const showSearch = listed.length > SEARCH_THRESHOLD

  const items: PickerOption[] = open
    ? [
        ...(variable.includeAll && !lowered
          ? [{ id: "all", option: null, stale: false }]
          : []),
        ...visible.map((option) => ({
          id: `option:${option.value}`,
          option,
          stale: !known.has(option.value),
        })),
      ]
    : []

  const selectItem = ({ option }: PickerOption) => {
    const selection =
      option === null
        ? "all"
        : variable.multi
          ? toggleOption(current, option)
          : [option]
    if (variable.multi) {
      setDraft({ base: variable.selected, selection })
    } else {
      if (!sameSelection(selection, variable.selected)) onChange(selection)
      setOpen(false)
      setQuery("")
    }
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (items.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      optionsRef.current?.focus()
      optionsRef.current?.navigateInTree({
        to: event.key === "ArrowDown" ? "start" : "end",
      })
    } else if (event.key === "Enter") {
      event.preventDefault()
      selectItem(items[0])
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) return
    setDraft(null)
    if (!sameSelection(current, variable.selected)) onChange(current)
  }

  return (
    <RadixPopover.Root open={open} onOpenChange={handleOpenChange}>
      <PickerLabel
        variable={variable}
        onPointerDown={() => handleOpenChange(!open)}
      />
      <RadixPopover.Trigger asChild>
        <Trigger
          label={summarize(current, options)}
          labelFontSize="1.3rem"
          leadingIcon={
            status?.status === "error" ? (
              <ErrorMark>
                <WarningIcon size={14} />
              </ErrorMark>
            ) : undefined
          }
          aria-label={variable.label ?? `@${variable.name}`}
          data-hook={`variable-list-${variable.name}`}
        />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <Content
          data-hook="variable-list-popover"
          sideOffset={4}
          align="start"
          aria-label={variable.label ?? `@${variable.name}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (showSearch) inputRef.current?.focus()
            else optionsRef.current?.focus()
          }}
        >
          {showSearch && (
            <SearchBox>
              <Input
                ref={inputRef}
                value={query}
                aria-label={`Search ${variable.label ?? `@${variable.name}`} values`}
                placeholder="Search"
                data-hook="variable-list-search"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </SearchBox>
          )}
          {items.length > 0 ? (
            <ListPickerOptions
              key={query}
              ref={optionsRef}
              items={items}
              selected={current}
              multi={variable.multi}
              label={variable.label ?? `@${variable.name}`}
              id={`variable-option-${variable.name}`}
              searchRef={inputRef}
              onSearch={setQuery}
              onSelect={selectItem}
            />
          ) : status?.status !== "loading" ? (
            <Empty data-hook="variable-list-empty">No matching values</Empty>
          ) : null}
          {status && (
            <Footer data-hook={`variable-list-status-${variable.name}`}>
              <Text
                size="xs"
                color={
                  status.status === "error"
                    ? "statusDanger"
                    : "contentSecondary"
                }
              >
                {describeStatus(status)}
              </Text>
              {onRefresh && (
                <IconButton
                  label="Refresh values"
                  data-hook="variable-list-refresh"
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  disabled={status.status === "loading"}
                >
                  <ArrowClockwiseIcon size={14} />
                </IconButton>
              )}
            </Footer>
          )}
        </Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
