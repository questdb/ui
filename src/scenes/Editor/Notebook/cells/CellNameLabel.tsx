import React, { useEffect, useRef, useState } from "react"
import styled, { css } from "styled-components"
import { MAX_CELL_NAME_LENGTH } from "../../../../store/notebook"

const Label = styled.button<{ $placeholder: boolean }>`
  min-width: 0;
  max-width: 100%;
  font-family: inherit;
  font-size: 1.6rem;
  font-weight: 600;
  text-align: left;
  color: ${({ theme }) => theme.color.foreground};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  user-select: none;
  padding: 0 0.4rem;
  flex-shrink: 1;
  background: transparent;

  border: 1px solid transparent;
  border-radius: 0.3rem;
  outline: none;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => `${theme.color.selection}80`};
  }

  ${({ $placeholder, theme }) =>
    $placeholder &&
    css`
      color: ${theme.color.gray2};
      font-weight: 400;
    `}
`

const Input = styled.input`
  min-width: 8rem;
  flex: 1;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.3rem;
  padding: 0 0.4rem;
  outline: none;
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
