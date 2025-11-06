import React, { useState, FormEvent, ReactNode, useRef, useEffect } from "react"
import styled from "styled-components"
import { Box, Button, Input, Loader, Select } from "@questdb/react-components"
import { Text } from "../Text"
import { PopperToggle } from "../PopperToggle"
import { Preferences, InstanceType } from "../../utils/questdb/types"

const Wrapper = styled.div`
  position: absolute;
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
  flex-wrap: wrap;
  align-self: center;
`

const ColorOption = styled.button<{ colorValue: string; selected: boolean; customColor?: string }>`
  width: 3rem;
  height: 3rem;
  border-radius: 0.4rem;
  cursor: pointer;
  border: 2px solid ${({ theme, selected }) => (selected ? theme.color.foreground : "transparent")};
  padding: 0;
  background: ${({ colorValue, theme, customColor }) => {
    if (customColor) return customColor;
    
    switch (colorValue) {
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
  
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.cyan};
  }
`

const ColorWheelOption = styled.button<{ selected: boolean }>`
  position: relative;
  width: 3rem;
  height: 3rem;
  border-radius: 0.4rem;
  cursor: pointer;
  border: ${({ selected, theme }) => selected ? `2px solid ${theme.color.foreground}` : "0"};
  padding: 0;
  overflow: hidden;

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.cyan};
  }

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: conic-gradient(
    #ff0000,
    #ffff00,
    #00ff00,
    #00ffff,
    #0000ff,
    #ff00ff,
    #ff0000
    );
  }
`

const ColorPickerContainer = styled.div`
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-self: center;
`

const ColorInputRow = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
`

const ColorSlider = styled.input.attrs({ type: 'range', min: 0, max: 255 })`
  flex: 1;
  height: 1rem;
  appearance: none;
  background: linear-gradient(to right, rgb(0,0,0), rgb(255,0,0));
  border-radius: 0.5rem;
  
  &::-webkit-slider-thumb {
    appearance: none;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: white;
    cursor: pointer;
    border: 1px solid ${({ theme }) => theme.color.gray1};
  }
  
  &.red {
    background: linear-gradient(to right, rgb(0,0,0), rgb(255,0,0));
  }
  
  &.green {
    background: linear-gradient(to right, rgb(0,0,0), rgb(0,255,0));
  }
  
  &.blue {
    background: linear-gradient(to right, rgb(0,0,0), rgb(0,0,255));
  }
`

const ColorValueInput = styled.input.attrs({ type: 'number', min: 0, max: 255 })`
  width: 6rem;
  padding: 0.5rem;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.cyan};
  }
`

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`

const StyledButton = styled(Button)`
  font-size: 1.6rem;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

const StyledSelect = styled(Select)`
  &:focus-visible {
    border: 1px solid ${({ theme }) => theme.color.cyan};
  }
`

const Buttons = styled(Box)`
  margin-top: 1.5rem;
  gap: 1rem;
  justify-content: flex-end;
  flex-direction: row-reverse;
`

const FormGroup = styled(Box).attrs({ flexDirection: "column", gap: "0.5rem" })`
  width: 100%;
  align-items: flex-start;
`

const StyledInput = styled(Input)`
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.cyan};
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
    border-color: ${({ theme }) => theme.color.cyan};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const FormLabel = styled.label<{ align?: 'left' | 'center' }>`
  text-align: ${props => props.align || 'left'};
  width: 100%;
  font-size: 1.6rem;
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
  trigger: ReactNode
}

export const InstanceSettingsPopper = ({ 
  active, 
  onToggle, 
  values, 
  onSave, 
  onValuesChange,
  trigger,
}: Props) => {
  const [isSaving, setIsSaving] = useState(false)
  const [instanceNameError, setInstanceNameError] = useState<string | null>(null)
  const [showCustomColor, setShowCustomColor] = useState(false)
  const [rgbValues, setRgbValues] = useState({ r: 0, g: 0, b: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (values.instance_rgb && values.instance_rgb.startsWith('rgb')) {
      setShowCustomColor(true)
      const matches = values.instance_rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (matches) {
        setRgbValues({
          r: parseInt(matches[1], 10),
          g: parseInt(matches[2], 10),
          b: parseInt(matches[3], 10)
        })
      }
    } else {
      setShowCustomColor(false)
    }
  }, [values.instance_rgb])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!values?.instance_name?.trim()) {
      setInstanceNameError("Instance name is required")
      return
    }
    setInstanceNameError(null)

    setIsSaving(true)
    await onSave(values) // Errors are handled in the parent component
    setIsSaving(false)
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValues = { ...values, instance_name: e.target.value }
    onValuesChange(newValues)
  }

  const handleColorSelect = (color: string | undefined) => {
    onValuesChange({ ...values, instance_rgb: color })
    if (color !== 'custom') {
      setShowCustomColor(false)
    }
  }

  const handleCustomColorSelect = () => {
    setShowCustomColor(true)
    onValuesChange({ ...values, instance_rgb: rgbColorString })
  }

  const handleRgbChange = (component: 'r' | 'g' | 'b', value: number) => {
    const newValues = { ...rgbValues, [component]: value }
    setRgbValues(newValues)
    const newRgbColor = `rgb(${newValues.r}, ${newValues.g}, ${newValues.b})`
    onValuesChange({ ...values, instance_rgb: newRgbColor })
  }

  useEffect(() => {
    if (!values.instance_type) {
      onValuesChange({ ...values, instance_type: "development" })
    }
    if (active) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [active])

  const rgbColorString = `rgb(${rgbValues.r}, ${rgbValues.g}, ${rgbValues.b})`

  return (
    <PopperToggle 
      active={active} 
      onToggle={onToggle} 
      trigger={trigger}
      placement="bottom-start"
    >
      <Wrapper>
        <StyledForm onSubmit={handleSubmit}>
          <FormGroup>
            <FormLabel htmlFor="instance-name-input">Instance Name</FormLabel>
            <StyledInput
              id="instance-name-input"
              data-hook="topbar-instance-name-input"
              value={values.instance_name}
              onChange={handleNameChange}
              placeholder="Enter instance name"
              ref={inputRef}
            />
            {instanceNameError && <ErrorText>{instanceNameError}</ErrorText>}
          </FormGroup>
          <FormGroup>
            <FormLabel htmlFor="instance-type-select">Instance Type</FormLabel>
            <StyledSelect
              id="instance-type-select"
              data-hook="topbar-instance-type-select"
              name="instance-type"
              options={[
                { label: "Development", value: "development" },
                { label: "Production", value: "production" },
                { label: "Testing", value: "testing" },
              ]}
              required
              value={values.instance_type}
              onChange={(e) => onValuesChange({ ...values, instance_type: e.target.value as InstanceType })}
            />
          </FormGroup>
          <FormGroup>
            <FormLabel htmlFor="instance-description-input">Description</FormLabel>
            <TextArea
              id="instance-description-input"
              data-hook="topbar-instance-description-input"
              value={values.instance_description}
              onChange={(e) => onValuesChange({ ...values, instance_description: e.target.value })}
              placeholder="Enter instance description"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel color="foreground">Color</FormLabel>
            <ColorSelector>
              <ColorOption
                type="button"
                colorValue="default"
                selected={!values.instance_rgb || values.instance_rgb === ''}
                onClick={() => handleColorSelect('')}
                data-hook="topbar-instance-color-option-default"
              />
              <ColorOption
                type="button"
                colorValue="r"
                selected={values.instance_rgb === "r"}
                onClick={() => handleColorSelect("r")}
                data-hook="topbar-instance-color-option-r"
              />
              <ColorOption
                type="button"
                colorValue="g"
                selected={values.instance_rgb === "g"}
                onClick={() => handleColorSelect("g")}
                data-hook="topbar-instance-color-option-g"
              />
              <ColorOption
                type="button"
                colorValue="b"
                selected={values.instance_rgb === "b"}
                onClick={() => handleColorSelect("b")}
                data-hook="topbar-instance-color-option-b"
              />
              <ColorWheelOption
                type="button"
                selected={Boolean(values.instance_rgb?.startsWith('rgb'))}
                onClick={handleCustomColorSelect}
                data-hook="topbar-instance-color-option-custom"
              />
            </ColorSelector>
            
            {showCustomColor && (
              <ColorPickerContainer>
                <ColorInputRow>
                  <Text color="foreground">R</Text>
                  <ColorSlider 
                    className="red"
                    value={rgbValues.r} 
                    onChange={(e) => handleRgbChange('r', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-slider-r"
                  />
                  <ColorValueInput 
                    value={rgbValues.r}
                    onChange={(e) => handleRgbChange('r', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-input-r"
                  />
                </ColorInputRow>
                <ColorInputRow>
                  <Text color="foreground">G</Text>
                  <ColorSlider 
                    className="green"
                    value={rgbValues.g} 
                    onChange={(e) => handleRgbChange('g', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-slider-g"
                  />
                  <ColorValueInput 
                    value={rgbValues.g}
                    onChange={(e) => handleRgbChange('g', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-input-g"
                  />
                </ColorInputRow>
                <ColorInputRow>
                  <Text color="foreground">B</Text>
                  <ColorSlider 
                    className="blue"
                    value={rgbValues.b} 
                    onChange={(e) => handleRgbChange('b', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-slider-b"
                  />
                  <ColorValueInput 
                    value={rgbValues.b}
                    onChange={(e) => handleRgbChange('b', parseInt(e.target.value, 10))}
                    data-hook="topbar-instance-color-input-b"
                  />
                </ColorInputRow>
              </ColorPickerContainer>
            )}
          </FormGroup>
          <Buttons>
            <StyledButton 
              type="submit"
              prefixIcon={isSaving ? <Loader /> : undefined} 
              data-hook="topbar-instance-save-button"
            >
              Save
            </StyledButton>
            <StyledButton 
              type="button"
              onClick={() => onToggle(false)} 
              skin="secondary" 
              data-hook="topbar-instance-cancel-button"
            >
              Cancel
            </StyledButton>
          </Buttons>
        </StyledForm>
      </Wrapper>
    </PopperToggle>
  )
} 
