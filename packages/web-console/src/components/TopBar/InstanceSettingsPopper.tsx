import React, { useState } from "react"
import styled from "styled-components"
import { Box, Button, Input } from "@questdb/react-components"
import { Text } from "../Text"
import { PopperToggle } from "../PopperToggle"
import { Preferences } from "../../utils"

const Wrapper = styled.div`
  position: absolute;
  left: 13.5rem;
  top: 4.5rem;
  margin-top: 0.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  padding: 1.5rem;
  width: 32rem;
  z-index: 1000;
`

const ColorSelector = styled.div`
  display: flex;
  gap: 1rem;
`

const ColorOption = styled.div<{ color: string; selected: boolean }>`
  width: 3rem;
  height: 3rem;
  border-radius: 0.4rem;
  cursor: pointer;
  background: ${({ color, theme }) => {
    switch (color) {
      case "r":
        return "#c7072d"
      case "g":
        return "#00aa3b"
      case "b":
        return "#007aff"
      case "default":
        return theme.color.backgroundLighter
      default:
        return "transparent"
    }
  }};
  border: 2px solid ${({ theme, selected }) => (selected ? theme.color.foreground : "transparent")};
`

const Buttons = styled(Box)`
  margin-top: 1.5rem;
  gap: 1rem;
  justify-content: flex-end;
`

const FormGroup = styled(Box).attrs({ flexDirection: "column", gap: "0.5rem" })`
  width: 100%;
`

const StyledInput = styled(Input)`
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.foreground};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 8rem;
  padding: 0.8rem;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-family: inherit;
  font-size: 1.4rem;
  line-height: 1.5;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.foreground};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const FormLabel = styled(Text)<{ align?: 'left' | 'center' }>`
  text-align: ${props => props.align || 'left'};
  width: 100%;
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.2rem;
  margin-top: 0.2rem;
`

type Props = {
  active: boolean
  onToggle: (active: boolean) => void
  values: Preferences
  onSave: (values: Preferences) => Promise<void>
  onValuesChange: (values: Preferences) => void
}

export const InstanceSettingsPopper = ({ 
  active, 
  onToggle, 
  values, 
  onSave, 
  onValuesChange,
}: Props) => {
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!values?.instance_name?.trim()) {
      setError("Instance name is required")
      return
    }
    setError(null)
    await onSave(values)
    onToggle(false)
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValues = { ...values, instance_name: e.target.value }
    onValuesChange(newValues)
    if (error && e.target.value.trim()) {
      setError(null)
    }
  }

  return (
    <PopperToggle 
      active={active} 
      onToggle={onToggle} 
      placement="bottom-start"
    >
      <Wrapper>
        <Box gap="1.5rem" flexDirection="column">
          <FormGroup>
            <FormLabel color="foreground">Instance Name</FormLabel>
            <StyledInput
              value={values.instance_name}
              onChange={handleNameChange}
              placeholder="Enter instance name"
            />
            {error && <ErrorText>{error}</ErrorText>}
          </FormGroup>
          <FormGroup>
            <FormLabel color="foreground">Description</FormLabel>
            <TextArea
              value={values.instance_description}
              onChange={(e) => onValuesChange({ ...values, instance_description: e.target.value })}
              placeholder="Enter instance description"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel color="foreground" align="center">Color</FormLabel>
            <ColorSelector>
              <ColorOption
                color="default"
                selected={values.instance_rgb === undefined}
                onClick={() => onValuesChange({ ...values, instance_rgb: undefined })}
              />
              {["r", "g", "b"].map((color) => (
                <ColorOption
                  key={color}
                  color={color}
                  selected={values.instance_rgb === color}
                  onClick={() => onValuesChange({ ...values, instance_rgb: color })}
                />
              ))}
            </ColorSelector>
          </FormGroup>
          <Buttons>
            <Button onClick={() => onToggle(false)} skin="secondary">
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </Buttons>
        </Box>
      </Wrapper>
    </PopperToggle>
  )
} 
