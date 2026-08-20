import React, { useEffect, useRef, useState } from "react"
import styled, { css } from "styled-components"
import { MAX_CELL_NAME_LENGTH } from "../../../../store/notebook"
import { ButtonBase } from "../../../../components"
import {
  NotebookRenameInput,
  notebookRenameFieldStyles,
} from "../NotebookRenameInput"

const Label = styled(ButtonBase)<{ $placeholder: boolean }>`
  ${notebookRenameFieldStyles}

  border-color: transparent;
  height: 2.4rem;
  max-width: 100%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  flex-shrink: 1;

  && {
    cursor: text;
  }

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.contentAccent};
  }

  ${({ $placeholder, theme }) =>
    $placeholder &&
    css`
      color: ${theme.color.contentSecondary};
      font-weight: 400;
    `}
`

const Input = styled(NotebookRenameInput)`
  min-width: 8rem;
  height: 2.4rem;
  flex: 1;
  border-color: ${({ theme }) => theme.color.contentAccent};

  &:focus,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.contentAccent};
  }
`

type Props = {
  name?: string
  onRename: (name: string) => void
}

export const CellNameLabel: React.FC<Props> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name ?? "")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const labelRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef(false)
  const wasEditingRef = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
    else if (wasEditingRef.current) labelRef.current?.focus()
    wasEditingRef.current = editing
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (cancelRef.current) {
      cancelRef.current = false
      return
    }
    const trimmed = draft.trim()
    if (trimmed !== (name ?? "")) onRename(trimmed)
  }

  const startEditing = () => {
    setDraft(name ?? "")
    setEditing(true)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        placeholder="Cell name"
        aria-label="Cell name"
        maxLength={MAX_CELL_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === "Escape") {
            cancelRef.current = true
            inputRef.current?.blur()
          }
        }}
      />
    )
  }

  return (
    <Label
      ref={labelRef}
      type="button"
      $placeholder={!name}
      aria-label={name ? `Cell name: ${name}. Rename` : "Name cell"}
      title={
        name
          ? `${name} — double-click or press Enter to rename`
          : "Double-click or press Enter to name"
      }
      onDoubleClick={(e) => {
        e.stopPropagation()
        startEditing()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2" || e.key === " ") {
          e.preventDefault()
          startEditing()
        }
      }}
    >
      {name || "Untitled"}
    </Label>
  )
}
