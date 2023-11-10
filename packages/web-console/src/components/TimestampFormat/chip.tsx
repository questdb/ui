import React, { useEffect, useState } from "react"
import { CloseOutline } from "@styled-icons/evaicons-outline"
import styled from "styled-components"
import type { TimestampFormat } from "../../modules/Import/SchemaEditor/types"
import { useFormContext } from "react-hook-form"

enum State {
  EDIT = "edit",
  OPTIMISTIC = "optimistic",
  SAVED = "saved",
  DISABLED = "disabled",
}

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
type Props = {
  index: number
  fieldID: string
  disabled?: boolean
  onClose: (index: number) => void
  onSave: (index: number, obj: TimestampFormat) => void
}

export const TimestampFormatChip = ({
  index,
  disabled = false,
  onClose,
  onSave,
  fieldID,
}: Props) => {
  const { register, watch } = useFormContext()

  const pattern = watch(fieldID)

  const [state, setState] = useState<State>(
    pattern?.length > 0 ? State.SAVED : State.EDIT,
  )

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

  const save = (_value: string) => {
    if (_value.length === 0) {
      onClose(index)
      return
    }
    onSave(index, { pattern: _value })
    setState(State.SAVED)
  }

  const handleClose = () => {
    if (state === State.DISABLED || state === State.OPTIMISTIC) {
      return
    }
    onClose(index)
  }

  return (
    <Chip className={state} onClick={onBodyClick}>
      {state === State.SAVED && <span>{pattern}</span>}
      {state === State.EDIT && (
        <>
          <input
            {...register(fieldID)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            onFocus={(e) => setState(State.EDIT)}
          />
          <button
            onClick={(e) => {
              save(pattern)
            }}
          >
            ✔
          </button>
        </>
      )}
      <button onClick={handleClose}>
        <Close />
      </button>
    </Chip>
  )
}
