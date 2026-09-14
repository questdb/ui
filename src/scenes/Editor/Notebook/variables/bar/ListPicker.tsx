import React, { useState } from "react"
import styled from "styled-components"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowClockwiseIcon,
  CheckIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import {
  IconButton,
  Input,
  SelectMenu,
  SelectMenuTriggerButton,
  Text,
} from "../../../../../components"
import { menuItemStyles } from "../../../../../components/menuStyles"
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
const ALL_VALUE = "__all__"
const NONE_VALUE = "__none__"
const STALE_SUFFIX = " (not in current values)"

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

const Options = styled.div`
  max-height: 32rem;
  overflow-y: auto;
`

const CheckItem = styled(RadixDropdownMenu.CheckboxItem)`
  ${menuItemStyles}
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.8rem;
  gap: 0.8rem;
  padding: 0.7rem 0.8rem;
`

const ItemLabel = styled.span<{ $stale?: boolean }>`
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

const ItemIndicator = styled(RadixDropdownMenu.ItemIndicator)`
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentAccent};
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
  const current =
    draft !== null && draft.base === variable.selected
      ? draft.selection
      : variable.selected
  const selected = current === "all" ? [] : current
  const selectedValues = new Set(selected.map((o) => o.value))
  const known = new Set(options.map((o) => o.value))
  const stale = selected.filter((o) => !known.has(o.value))
  const listed = [...options, ...stale]
  const lowered = query.trim().toLowerCase()
  const visible = lowered
    ? listed.filter((option) => matches(option, lowered))
    : listed
  const showSearch = listed.length > SEARCH_THRESHOLD

  const pickSingle = (value: string) => {
    if (value === ALL_VALUE) {
      onChange("all")
      return
    }
    const option = listed.find((o) => o.value === value)
    onChange(option ? [option] : [])
  }

  const editMulti = (selection: ListSelection) =>
    setDraft({ base: variable.selected, selection })

  const isStale = (option: VariableOption) => stale.includes(option)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) return
    setDraft(null)
    if (!sameSelection(current, variable.selected)) onChange(current)
  }

  return (
    <RadixDropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
      <PickerLabel
        variable={variable}
        onPointerDown={() => handleOpenChange(!open)}
      />
      <RadixDropdownMenu.Trigger asChild>
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
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <SelectMenu.Content sideOffset={4} align="start" minWidth="25rem">
          {showSearch && (
            <SearchBox>
              <Input
                value={query}
                placeholder="Search"
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </SearchBox>
          )}
          <Options>
            {variable.multi ? (
              <>
                {variable.includeAll && !lowered && (
                  <CheckItem
                    checked={current === "all"}
                    onCheckedChange={() => editMulti("all")}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <ItemLabel>All</ItemLabel>
                    <ItemIndicator>
                      <CheckIcon size={16} weight="bold" />
                    </ItemIndicator>
                  </CheckItem>
                )}
                {visible.map((option) => (
                  <CheckItem
                    key={option.value}
                    checked={selectedValues.has(option.value)}
                    onCheckedChange={() =>
                      editMulti(toggleOption(current, option))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <ItemLabel $stale={isStale(option)}>
                      {option.label}
                      {isStale(option) ? STALE_SUFFIX : ""}
                    </ItemLabel>
                    <ItemIndicator>
                      <CheckIcon size={16} weight="bold" />
                    </ItemIndicator>
                  </CheckItem>
                ))}
              </>
            ) : (
              <RadixDropdownMenu.RadioGroup
                value={
                  variable.selected === "all"
                    ? ALL_VALUE
                    : (selected[0]?.value ?? NONE_VALUE)
                }
                onValueChange={pickSingle}
              >
                {variable.includeAll && !lowered && (
                  <SelectMenu.Item value={ALL_VALUE}>All</SelectMenu.Item>
                )}
                {visible.map((option) => (
                  <SelectMenu.Item key={option.value} value={option.value}>
                    {option.label}
                    {isStale(option) ? STALE_SUFFIX : ""}
                  </SelectMenu.Item>
                ))}
              </RadixDropdownMenu.RadioGroup>
            )}
            {visible.length === 0 && status?.status !== "loading" && (
              <Empty>No matching values</Empty>
            )}
          </Options>
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
        </SelectMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}
