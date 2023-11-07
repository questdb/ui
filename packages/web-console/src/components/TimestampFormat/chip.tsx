import React, { KeyboardEvent, useEffect, useState } from "react"
import { CloseOutline } from "@styled-icons/evaicons-outline"
import styled from "styled-components"
import type { TimestampFormat } from "../../modules/Import/SchemaEditor/types"

enum State {
  EDIT = "edit",
  OPTIMISTIC = "optimistic",
  SAVED = "saved",
  DISABLED = "disabled",
}

type Props = {
  id: React.Key
  data: TimestampFormat
  onClose: () => void
  onSave: (key: React.Key, value: string) => void
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "disabled" | "onChange">

const Close = styled(CloseOutline).attrs({ size: "18px", strokeWidth: "4px" })``

const Chip = styled.li`
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 0.75rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-evenly;

  gap: 1rem;
  font-size: 12px;
  white-space: nowrap;

  &.edit {
    cursor: pointer;
    background: green;
    padding-block: 0.5rem;
  }

  &.saved {
    cursor: pointer;
    background: red;
  }

  &.disabled {
    background: grey;
    ${Close} {
      pointer-events: none;
    }
  }

  button {
    background: unset;
    width: unset;
    display: inline-block;
    color: inherit;

    border-color: transparent;
  }
`

export const TimestampFormatChip = ({
  id,
  data,
  disabled,
  onSave,
  onClose,
}: Props) => {
  const [state, setState] = useState<State>(
    data.pattern.length ? State.SAVED : State.EDIT,
  )
  const [value, setValue] = useState(data.pattern)

  useEffect(() => {
    if (disabled) {
      setState(State.DISABLED)
    }
  }, [disabled])

  const onBodyClick = () => {
    if (state === State.SAVED) {
      setState(State.EDIT)
    }
  }

  const onValueEdit: Props["onChange"] = (e) => {
    const {
      target: { value },
    } = e
    setValue(value)
  }

  const save = () => {
    if (!value.length) {
      onClose()
      return
    }

    onSave(id, value)
    setState(State.SAVED)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()

      if (state === State.EDIT) {
        save()
      } else if (state === State.SAVED) {
        setState(State.EDIT)
      }
    }
  }

  const handleClose = () => {
    if (state === State.DISABLED || state === State.OPTIMISTIC) {
      return
    }
    onClose()
  }

  return (
    <Chip className={state} onClick={onBodyClick}>
      {state === State.SAVED && <span>{data.pattern}</span>}
      {state === State.EDIT && (
        <>
          <input
            type="text"
            value={value}
            onChange={onValueEdit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            autoFocus
            onFocus={(e) => setState(State.EDIT)}
          />
          <button onClick={() => save()}>✔</button>
        </>
      )}
      <button onClick={handleClose}>
        <Close />
      </button>
    </Chip>
  )
}
