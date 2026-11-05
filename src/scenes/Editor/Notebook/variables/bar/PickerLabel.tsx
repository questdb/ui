import React from "react"
import styled from "styled-components"
import { Text, Tooltip } from "../../../../../components"
import type { NotebookVariable } from "../../../../../store/notebook"

const Label = styled.label`
  display: inline-flex;
  cursor: pointer;
  user-select: none;
`

type Props = {
  variable: NotebookVariable
  htmlFor?: string
  onPointerDown?: () => void
}

export const PickerLabel = ({ variable, htmlFor, onPointerDown }: Props) => (
  <Tooltip content={variable.description} placement="bottom">
    <Label htmlFor={htmlFor} onPointerDown={onPointerDown}>
      <Text color="contentSecondary" size="sm">
        {variable.label ?? `@${variable.name}`}
      </Text>
    </Label>
  </Tooltip>
)
