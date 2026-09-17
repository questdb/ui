import React, { useState } from "react"
import styled from "styled-components"
import {
  DotsSixVerticalIcon,
  PlusIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { useTheme } from "styled-components"
import { Button, IconButton, Text } from "../../../../../components"
import { Trash } from "../../../../../components/icons"
import type { TimeRange } from "../../../../../store/notebook"
import type { VariableScope } from "../scope"
import { TIME_VARIABLE_NAMES, timeRangeToDeclareEntries } from "../timeRange"
import { DeclarationLines } from "../TimeRangeDeclarations"
import {
  draftsInScope,
  type DraftProblem,
  type VariableDraft,
} from "../variableDrafts"

const Pane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  padding: 1.6rem 1.2rem;
  overflow-y: auto;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`

const SectionTitle = styled(Text).attrs({
  size: "lg",
  weight: 600,
  color: "contentPrimary",
})`
  display: block;
  padding: 0 0.6rem;
  margin-bottom: 0.8rem;
`

const BuiltIns = styled.div`
  padding: 0 0.6rem;

  pre {
    font-size: 1.4rem;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  [data-hook="declaration-lines"] {
    gap: 0.8rem;
  }
`

const MutedNames = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 0.6rem;
  gap: 0.8rem;
  color: ${({ theme }) => theme.color.contentMuted};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  line-height: 1.5;
`

const Hint = styled(Text).attrs({ size: "sm", color: "contentSecondary" })`
  display: block;
  padding: 0.6rem 0.6rem 0;
`

const Row = styled.div<{
  $selected: boolean
  $dragging: boolean
}>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.4rem 0.6rem 0.2rem;
  box-shadow: ${({ $selected, theme }) =>
    $selected ? `inset 2px 0 0 ${theme.color.contentAccent}` : "none"};
  background: ${({ $selected, theme }) =>
    $selected ? theme.color.surfaceInset : "transparent"};
  cursor: pointer;
  opacity: ${({ $dragging }) => ($dragging ? 0.55 : 1)};
  transition: background-color 0.12s ease;
  outline: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.borderAccent};
  }

  &:hover {
    background: ${({ $selected, theme }) =>
      $selected ? theme.color.surfaceInset : theme.color.interactionNeutral};
  }

  &:hover [data-hook="drag-handle"],
  &:hover [data-hook="variable-delete"],
  &:focus-visible [data-hook="variable-delete"] {
    opacity: 1;
  }
`

const DragHandle = styled(IconButton).attrs({
  variant: "ghost",
  size: "sm",
  "data-hook": "drag-handle",
})`
  width: 1.8rem;
  min-width: 1.8rem;
  height: 2.2rem;
  padding: 0;
  opacity: 0.35;

  &:focus-visible {
    opacity: 1;
  }

  && {
    cursor: grab;
  }

  &&:active {
    cursor: grabbing;
  }
`

const Name = styled.span<{ $empty: boolean }>`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  color: ${({ $empty, theme }) =>
    $empty ? theme.color.contentMuted : theme.color.editorSyntaxConstant};
  font-style: italic;
`

const Badges = styled.span`
  display: flex;
  align-items: center;
  gap: 0.4rem;
`

const DeleteButton = styled(IconButton).attrs({
  variant: "dangerGhost",
  size: "sm",
  "data-hook": "variable-delete",
})`
  padding: 0.2rem;
  opacity: 0;

  &:focus-visible {
    opacity: 1;
  }
`

const AddButton = styled(Button).attrs({
  variant: "ghost",
  prefixIcon: <PlusIcon size={14} />,
})`
  align-self: flex-start;
  margin-top: 0.4rem;
`

type Props = {
  drafts: VariableDraft[]
  selectedKey: string | null
  problems: Record<string, DraftProblem | null>
  errors: Record<string, string>
  timeRange: TimeRange | undefined
  onSelect: (key: string) => void
  onAdd: () => void
  onDelete: (key: string) => void
  onMove: (key: string, scope: VariableScope, toIndex: number) => void
}

export const VariableList = ({
  drafts,
  selectedKey,
  problems,
  errors,
  timeRange,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: Props) => {
  const theme = useTheme()
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  const handleDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    key: string,
  ) => {
    setDraggingKey(key)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", key)
  }

  const handleDragOver = (
    e: React.DragEvent<HTMLElement>,
    scope: VariableScope,
    index: number,
  ) => {
    if (!draggingKey) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const toIndex = e.clientY > rect.top + rect.height / 2 ? index + 1 : index
    onMove(draggingKey, scope, toIndex)
  }

  const handleDragEnd = () => setDraggingKey(null)

  const handleHandleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
    scope: VariableScope,
    index: number,
  ) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    onMove(key, scope, e.key === "ArrowUp" ? index - 1 : index + 2)
  }

  const renderRow = (draft: VariableDraft, index: number) => {
    const { variable, scope } = draft
    const problem = problems[draft.key] ?? errors[draft.key]
    return (
      <Row
        key={draft.key}
        role="button"
        tabIndex={0}
        aria-pressed={draft.key === selectedKey}
        $selected={draft.key === selectedKey}
        $dragging={draggingKey === draft.key}
        onClick={() => onSelect(draft.key)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(draft.key)
          }
        }}
        onDragOver={(e) => handleDragOver(e, scope, index)}
        onDrop={handleDragEnd}
        data-hook="variable-row"
        data-scope={scope}
      >
        <DragHandle
          label={`Reorder ${variable.name || "variable"} (drag or arrow keys)`}
          draggable
          onDragStart={(e) => handleDragStart(e, draft.key)}
          onDragEnd={handleDragEnd}
          onKeyDown={(e) => handleHandleKeyDown(e, draft.key, scope, index)}
          onClick={(e) => e.stopPropagation()}
        >
          <DotsSixVerticalIcon size={15} />
        </DragHandle>
        <Name $empty={variable.name === ""}>
          {variable.name ? `@${variable.name}` : "unnamed"}
        </Name>
        <Badges>
          {problem && (
            <WarningIcon size={18} color={theme.color.statusDanger} />
          )}
        </Badges>
        <DeleteButton
          label={`Delete ${variable.name || "variable"}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(draft.key)
          }}
        >
          <Trash size={14} />
        </DeleteButton>
      </Row>
    )
  }

  const globalDrafts = draftsInScope(drafts, "global")
  const notebookDrafts = draftsInScope(drafts, "notebook")

  return (
    <Pane data-hook="variables-list">
      <Section>
        <SectionTitle>Time range</SectionTitle>
        {timeRange ? (
          <BuiltIns>
            <DeclarationLines
              entries={timeRangeToDeclareEntries(timeRange)}
              stacked
            />
          </BuiltIns>
        ) : (
          <>
            <MutedNames>
              {TIME_VARIABLE_NAMES.map((name) => (
                <span key={name}>@{name}</span>
              ))}
            </MutedNames>
            <Hint>
              Pick a time range in the toolbar to define these variables.
            </Hint>
          </>
        )}
      </Section>
      <Section data-hook="variables-global-section">
        <SectionTitle>All notebooks</SectionTitle>
        {globalDrafts.length === 0 && (
          <Hint>
            Set a variable&apos;s scope to &quot;All notebooks&quot; to share it
            with every notebook.
          </Hint>
        )}
        {globalDrafts.map(renderRow)}
      </Section>
      <Section data-hook="variables-notebook-section">
        <SectionTitle>This notebook</SectionTitle>
        {notebookDrafts.map(renderRow)}
        <AddButton onClick={onAdd} data-hook="variable-add">
          Add variable
        </AddButton>
      </Section>
    </Pane>
  )
}
