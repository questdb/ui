import React, { KeyboardEvent, useEffect, useState } from "react"
import { CloseOutline } from "@styled-icons/evaicons-outline"
import styled from "styled-components"
import type { Timestamp } from "../types"

enum State {
  EDIT = "edit",
  OPTIMISTIC = "optimistic",
  SAVED = "saved",
  DISABLED = "disabled",
}

type Props = {
  id: React.Key
  data: Timestamp
  onClose: () => void
  onSave: (key: React.Key, value: string) => void
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "disabled" | "onChange">

const Close = styled(CloseOutline).attrs({ size: "18px" })``

const Chip = styled.li`
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 2rem 1rem;
  display: flex;
  gap: 1rem;
  font-size: 12px;
  white-space: nowrap;

  &.edit {
    cursor: pointer;
    background: green;
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
`

export const TimestampChip = ({
  id,
  data,
  disabled,
  onSave,
  onClose,
}: Props) => {
  const [state, setState] = useState<State>(State.SAVED)
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()

      onSave(id, value)
      setState(State.SAVED)
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
        <input
          type="text"
          value={value}
          onChange={onValueEdit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        />
      )}
      <Close onClick={handleClose} />
    </Chip>
  )
}
