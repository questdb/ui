import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import * as RadixPopover from "@radix-ui/react-popover"
import {
  CaretRightIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import { ButtonBase } from "../../../../components/Button"
import { Input } from "../../../../components/Input"
import { TextButton } from "../../../../components/TextButton"
import {
  menuContainerStyles,
  menuInputStyles,
} from "../../../../components/menuStyles"
import { CircleNotchSpinner } from "../../Monaco/icons"
import type { LocalAgentSnapshot } from "../../../../utils/localAgent/localAgentChannel"
import { ComposerTrigger } from "./ComposerTrigger"
import { ModelIcon } from "./ModelIcon"
import {
  filterModelGroups,
  type ModelGroup,
  type ModelOption,
  type ModelSelection,
} from "./modelOptions"
import { isImeKeyEvent } from "../../../../utils/isImeKeyEvent"

const Content = styled(RadixPopover.Content)`
  ${menuContainerStyles}
  width: 32rem;
  max-width: calc(100vw - 2rem);
  max-height: min(44rem, var(--radix-popover-content-available-height));
  padding: 0.4rem;
  gap: 0;
  overflow: hidden;
`

const SearchField = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.4rem 0.4rem 0.8rem;

  > svg {
    position: absolute;
    left: 1.2rem;
    color: ${({ theme }) => theme.color.contentMuted};
    pointer-events: none;
  }
`

const SearchInput = styled(Input)`
  ${menuInputStyles}
  width: 100%;
  padding-left: 3rem;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow-y: auto;
  min-height: 0;
`

const GroupHeader = styled(ButtonBase)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  min-height: 3.2rem;
  padding: 0.6rem 0.8rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.6rem;
  text-align: left;

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const GroupLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const GroupCaption = styled.span`
  flex-shrink: 0;
  font-size: 1.2rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentMuted};
`

const GroupIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentSecondary};

  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

const GroupCaret = styled(CaretRightIcon)`
  flex-shrink: 0;
  margin-left: auto;
  color: ${({ theme }) => theme.color.contentMuted};
  transition: transform 120ms ease-out;

  [aria-expanded="true"] > & {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.6rem;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
  padding: 0.6rem 0.8rem 0.6rem 3rem;
  border-radius: 0.4rem;
  cursor: pointer;
  color: ${({ theme }) => theme.color.contentPrimary};

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const RowCopy = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`

const RowLabel = styled.span`
  font-size: 1.3rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RowDetail = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Check = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.contentAccent};
`

const Notice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.6rem 0.8rem 0.8rem 3rem;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const NoticeAction = styled(TextButton)`
  flex-shrink: 0;
  margin-left: auto;
`

type ModelPickerProps = {
  groups: ModelGroup[]
  selectedKey: string | null
  triggerLabel: string
  triggerProvider: string | null
  agent: LocalAgentSnapshot | null
  disabled: boolean
  onSelect: (selection: ModelSelection) => void
  // Takes focus once a model is chosen, or the picker /model opened closes.
  onDone?: () => void
  onRestartAgent: () => void
  // Each new value opens the picker, as /model does.
  openSignal?: number | null
}

const AgentNotice = ({
  agent,
  onRestart,
}: {
  agent: LocalAgentSnapshot
  onRestart: () => void
}) => {
  if (agent.state === "starting") {
    return (
      <Notice role="status">
        <CircleNotchSpinner size={14} />
        Starting {agent.info.label}
      </Notice>
    )
  }
  if (agent.state === "error") {
    return (
      <Notice role="alert">
        {agent.error ?? `${agent.info.label} is unavailable`}
        <NoticeAction onClick={onRestart}>Start again</NoticeAction>
      </Notice>
    )
  }
  return null
}

// Keyboard navigation walks group headers and the options of open groups.
type NavItem =
  | { kind: "group"; key: string; group: ModelGroup }
  | { kind: "option"; key: string; option: ModelOption }

const headerKey = (group: ModelGroup) => `group:${group.key}`

// Opens with only the selected model's provider expanded.
const initiallyExpanded = (
  groups: ModelGroup[],
  selectedKey: string | null,
): Set<string> => {
  const selected =
    groups.find((group) =>
      group.options.some((option) => option.key === selectedKey),
    ) ?? groups[0]
  return new Set(selected ? [selected.key] : [])
}

// Centers the selected row, so a long list opens where the user left it.
const scrollToSelected = (list: HTMLElement, selectedKey: string) => {
  const row = list.querySelector<HTMLElement>(
    `[data-key="${CSS.escape(selectedKey)}"]`,
  )
  if (!row) return
  const listBox = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  list.scrollTop +=
    rowBox.top - listBox.top - (listBox.height - rowBox.height) / 2
}

export const ModelPicker = ({
  groups,
  selectedKey,
  triggerLabel,
  triggerProvider,
  agent,
  disabled,
  onSelect,
  onRestartAgent,
  openSignal = null,
  onDone,
}: ModelPickerProps) => {
  const [open, setOpen] = useState(false)
  // Whether closing hands focus to onDone rather than back to the trigger.
  const handsOff = useRef(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const visibleGroups = useMemo(
    () => filterModelGroups(groups, query),
    [groups, query],
  )
  const agentGroupKey = agent ? `agent:${agent.info.id}` : null
  const showAgentNotice =
    agent !== null && agent.state !== "ready" && query.trim() === ""
  const shownGroups = groups
    .filter(
      (group) =>
        visibleGroups.some((visible) => visible.key === group.key) ||
        (showAgentNotice && group.key === agentGroupKey),
    )
    .map(
      (group) =>
        visibleGroups.find((visible) => visible.key === group.key) ?? {
          ...group,
          options: [],
        },
    )
  const navItems: NavItem[] = shownGroups.flatMap((group) => [
    { kind: "group" as const, key: headerKey(group), group },
    ...(expanded.has(group.key)
      ? group.options.map((option) => ({
          kind: "option" as const,
          key: option.key,
          option,
        }))
      : []),
  ])

  useEffect(() => {
    if (!open || !selectedKey) return
    const frame = requestAnimationFrame(() => {
      if (listRef.current) scrollToSelected(listRef.current, selectedKey)
    })
    return () => cancelAnimationFrame(frame)
    // Only when the menu opens: choosing a model closes it anyway.
  }, [open])

  const changeOpen = (next: boolean) => {
    if (next && disabled) return
    if (next) handsOff.current = false
    setOpen(next)
    setQuery("")
    setHighlighted(next ? selectedKey : null)
    if (next) setExpanded(initiallyExpanded(groups, selectedKey))
  }

  useLayoutEffect(() => {
    if (!disabled) return
    // Radix runs close autofocus after unmount; don't redirect that focus.
    handsOff.current = false
    setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (openSignal === null || disabled) return
    changeOpen(true)
    handsOff.current = true
    // Only a new request opens it.
  }, [openSignal])

  const changeQuery = (value: string) => {
    setQuery(value)
    setHighlighted(null)
    // A search shows every match; clearing it returns to the selected group.
    setExpanded(
      value.trim() === ""
        ? initiallyExpanded(groups, selectedKey)
        : new Set(filterModelGroups(groups, value).map((group) => group.key)),
    )
  }

  const toggleGroup = (groupKey: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const choose = (option: ModelOption) => {
    if (disabled) return
    handsOff.current = true
    onSelect(option.selection)
    changeOpen(false)
  }

  const moveHighlight = (direction: 1 | -1) => {
    if (navItems.length === 0) return
    const index = navItems.findIndex((item) => item.key === highlighted)
    const next =
      index === -1
        ? direction === 1
          ? navItems[0]
          : navItems[navItems.length - 1]
        : navItems[(index + direction + navItems.length) % navItems.length]
    setHighlighted(next.key)
    listRef.current
      ?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeKeyEvent(event)) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      moveHighlight(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item =
        navItems.find((candidate) => candidate.key === highlighted) ??
        navItems.find((candidate) => candidate.kind === "option")
      if (item?.kind === "group") toggleGroup(item.group.key)
      else if (item) choose(item.option)
    }
  }

  return (
    <RadixPopover.Root open={open && !disabled} onOpenChange={changeOpen}>
      <RadixPopover.Trigger asChild>
        <ComposerTrigger
          icon={<ModelIcon provider={triggerProvider} />}
          label={triggerLabel}
          aria-label={`Model: ${triggerLabel}`}
          disabled={disabled}
          data-hook="chat-model-picker"
        />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          data-hook="chat-model-picker-menu"
          onInteractOutside={() => {
            // Leave focus on the outside control, even for a slash-opened menu.
            handsOff.current = false
          }}
          onCloseAutoFocus={(event) => {
            if (!handsOff.current || !onDone) return
            event.preventDefault()
            onDone()
          }}
        >
          <SearchField>
            <MagnifyingGlassIcon size={14} aria-hidden="true" />
            <SearchInput
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                highlighted ? `${listId}-${highlighted}` : undefined
              }
              aria-label="Search models"
              placeholder="Search models"
              autoComplete="off"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              data-hook="chat-model-picker-search"
            />
          </SearchField>
          <List ref={listRef} id={listId} role="listbox" aria-label="Models">
            {shownGroups.length === 0 && (
              <Notice role="status">No matching models</Notice>
            )}
            {shownGroups.map((group) => {
              const isExpanded = expanded.has(group.key)
              const panelId = `${listId}-panel-${group.key}`
              return (
                <div key={group.key} role="group" aria-label={group.label}>
                  <GroupHeader
                    id={`${listId}-${headerKey(group)}`}
                    data-key={headerKey(group)}
                    tabIndex={-1}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    data-highlighted={
                      highlighted === headerKey(group) ? "" : undefined
                    }
                    // Keep focus in the search field.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setHighlighted(headerKey(group))}
                    onClick={() => toggleGroup(group.key)}
                    data-hook="chat-model-picker-group"
                  >
                    <GroupIcon>
                      <ModelIcon provider={group.provider} />
                    </GroupIcon>
                    <GroupLabel>{group.label}</GroupLabel>
                    {group.caption && (
                      <GroupCaption>{group.caption}</GroupCaption>
                    )}
                    <GroupCaret size={12} weight="bold" aria-hidden="true" />
                  </GroupHeader>
                  {isExpanded && (
                    <div id={panelId}>
                      {group.key === agentGroupKey &&
                        agent &&
                        showAgentNotice && (
                          <AgentNotice
                            agent={agent}
                            onRestart={onRestartAgent}
                          />
                        )}
                      {group.options.map((option) => (
                        <Row
                          key={option.key}
                          id={`${listId}-${option.key}`}
                          data-key={option.key}
                          role="option"
                          aria-selected={option.key === selectedKey}
                          data-highlighted={
                            option.key === highlighted ? "" : undefined
                          }
                          onMouseMove={() => setHighlighted(option.key)}
                          onClick={() => choose(option)}
                          data-hook="chat-model-picker-option"
                        >
                          <RowCopy>
                            <RowLabel data-hook="chat-model-picker-option-label">
                              {option.label}
                            </RowLabel>
                            {option.detail && (
                              <RowDetail title={option.detail}>
                                {option.detail}
                              </RowDetail>
                            )}
                          </RowCopy>
                          <Check>
                            {option.key === selectedKey && (
                              <CheckIcon size={14} weight="bold" />
                            )}
                          </Check>
                        </Row>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </List>
        </Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
