import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { SelectMenu } from "../../../../components/SelectMenu"
import { ComposerTrigger } from "./ComposerTrigger"
import type { EffortControl } from "./modelOptions"

const Prefix = styled.span`
  color: ${({ theme }) => theme.color.contentMuted};
`

type EffortPickerProps = {
  control: EffortControl
  disabled: boolean
  onChange: (value: string) => void
  // Each new value opens the picker, as /effort does.
  openSignal?: number | null
  // Takes focus once a level is chosen, or the picker /effort opened closes.
  onDone?: () => void
}

export const EffortPicker = ({
  control,
  disabled,
  onChange,
  openSignal = null,
  onDone,
}: EffortPickerProps) => {
  const [open, setOpen] = useState(false)
  // Whether closing hands focus to onDone rather than back to the trigger.
  const handsOff = useRef(false)
  const changeOpen = (next: boolean) => {
    if (next) handsOff.current = false
    setOpen(next)
  }
  useEffect(() => {
    if (openSignal === null || disabled) return
    changeOpen(true)
    handsOff.current = true
    // Only a new request opens it.
  }, [openSignal])
  const current =
    control.choices.find((choice) => choice.value === control.current) ??
    control.choices[0]
  return (
    <SelectMenu.Root open={open} onOpenChange={changeOpen}>
      <RadixDropdownMenu.Trigger asChild>
        <ComposerTrigger
          label={
            <>
              <Prefix>Effort</Prefix> {current.label}
            </>
          }
          aria-label={`Effort: ${current.label}`}
          disabled={disabled}
          data-hook="chat-effort-picker"
        />
      </RadixDropdownMenu.Trigger>
      <SelectMenu.Portal>
        <SelectMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          minWidth="16rem"
          data-hook="chat-effort-picker-menu"
          onCloseAutoFocus={(event) => {
            if (!handsOff.current || !onDone) return
            event.preventDefault()
            onDone()
          }}
        >
          <SelectMenu.RadioGroup
            value={current.value}
            onValueChange={(value) => {
              handsOff.current = true
              onChange(value)
            }}
          >
            {control.choices.map((choice) => (
              <SelectMenu.Item key={choice.value} value={choice.value}>
                {choice.label}
              </SelectMenu.Item>
            ))}
          </SelectMenu.RadioGroup>
        </SelectMenu.Content>
      </SelectMenu.Portal>
    </SelectMenu.Root>
  )
}
