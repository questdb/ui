import React, { useState, FormEvent, ReactNode, useRef, useEffect } from "react"
import styled from "styled-components"
import {
  Button,
  ButtonBase,
  Input,
  Loader,
  PopperToggle,
  SelectMenuControl,
  TextArea as DefaultTextArea,
} from "../../components"
import { Preferences, InstanceType } from "../../utils/questdb/types"
import { menuContainerStyles } from "../menuStyles"
import { InstanceTypeIcon } from "./InstanceTypeIcon"

const Wrapper = styled.div`
  ${menuContainerStyles}
  position: absolute;
  width: 34rem;
  max-height: min(78vh, 68rem);
  margin-top: 0.6rem;
  padding: 1.6rem;
  gap: 0;
  overflow-y: auto;
  white-space: normal;
`

const ColorSelector = styled.div`
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
`

const ColorOption = styled(ButtonBase)<{
  $colorValue: string
  $selected: boolean
}>`
  &&:disabled {
    opacity: 0.5;
  }
  width: 3.4rem;
  height: 3.4rem;
  flex: 0 0 3.4rem;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.color.borderAccentStrong : theme.color.borderDefault};
  border-radius: 0.6rem;
  padding: 0;
  background: ${({ $colorValue, theme }) => {
    switch ($colorValue) {
      case "r":
        return theme.color.instancePreset1
      case "g":
        return theme.color.instancePreset2
      case "b":
        return theme.color.instancePreset3
      case "default":
        return theme.color.transparent
      default:
        return theme.color.transparent
    }
  }};
  box-shadow: ${({ $selected, theme }) =>
    $selected ? `inset 0 0 0 1px ${theme.color.borderAccentStrong}` : "none"};

  &:hover {
    border-color: ${({ theme }) => theme.color.borderStrong};
  }
`

const ColorWheelOption = styled(ButtonBase)<{ $selected: boolean }>`
  &&:disabled {
    opacity: 0.5;
  }
  position: relative;
  width: 3.4rem;
  height: 3.4rem;
  flex: 0 0 3.4rem;
  border: 1px solid
    ${({ $selected, theme }) =>
      $selected ? theme.color.borderAccentStrong : theme.color.borderDefault};
  border-radius: 0.6rem;
  padding: 0;
  overflow: hidden;
  box-shadow: ${({ $selected, theme }) =>
    $selected ? `inset 0 0 0 1px ${theme.color.borderAccentStrong}` : "none"};

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: conic-gradient(
      ${({ theme }) => theme.color.pickerHue0},
      ${({ theme }) => theme.color.pickerHue1},
      ${({ theme }) => theme.color.pickerHue2},
      ${({ theme }) => theme.color.pickerHue3},
      ${({ theme }) => theme.color.pickerHue4},
      ${({ theme }) => theme.color.pickerHue5},
      ${({ theme }) => theme.color.pickerHue0}
    );
  }

  &:hover {
    border-color: ${({ theme }) => theme.color.borderStrong};
  }
`

const ColorPickerContainer = styled.div`
  margin-top: 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: 100%;
  padding: 1rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-radius: 0.6rem;
`

const ColorInputRow = styled.div`
  display: grid;
  grid-template-columns: 1.2rem minmax(0, 1fr) 6rem;
  gap: 0.8rem;
  align-items: center;
`

const ChannelLabel = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
`

const ColorSlider = styled.input.attrs({ type: "range", min: 0, max: 255 })`
  flex: 1;
  height: 1rem;
  appearance: none;
  background: ${({ theme }) =>
    `linear-gradient(to right, ${theme.color.neutralInk}, ${theme.color.pickerHue0})`};
  border-radius: 0.5rem;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.contentInverse};
    cursor: pointer;
    border: 1px solid ${({ theme }) => theme.color.contentDisabled};
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.contentAccent};
    outline-offset: 2px;
  }

  &.red {
    background: ${({ theme }) =>
      `linear-gradient(to right, ${theme.color.neutralInk}, ${theme.color.pickerHue0})`};
  }

  &.green {
    background: ${({ theme }) =>
      `linear-gradient(to right, ${theme.color.neutralInk}, ${theme.color.pickerHue2})`};
  }

  &.blue {
    background: ${({ theme }) =>
      `linear-gradient(to right, ${theme.color.neutralInk}, ${theme.color.pickerHue4})`};
  }
`

const ColorValueInput = styled(Input).attrs({
  type: "number",
  min: 0,
  max: 255,
})`
  width: 6rem;
  text-align: right;
`

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
`

const Buttons = styled.div`
  display: flex;
  margin-top: 0.2rem;
  padding-top: 1.4rem;
  gap: 0.8rem;
  justify-content: flex-end;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
`

const StyledInput = styled(Input)`
  width: 100%;
`

const TextArea = styled(DefaultTextArea)`
  width: 100%;
  min-height: 8rem;
  resize: vertical;
`

const FormLabel = styled.label<{ align?: "left" | "center" }>`
  text-align: ${(props) => props.align || "left"};
  width: 100%;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1.4;
`

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.color.statusDanger};
`

const ErrorText = styled.span`
  color: ${({ theme }) => theme.color.statusDanger};
  font-size: 1.2rem;
  line-height: 1.4;
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
  const [instanceNameError, setInstanceNameError] = useState<string | null>(
    null,
  )
  const [showCustomColor, setShowCustomColor] = useState(false)
  const [rgbValues, setRgbValues] = useState({ r: 0, g: 0, b: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (values.instance_rgb && values.instance_rgb.startsWith("rgb")) {
      setShowCustomColor(true)
      const matches = values.instance_rgb.match(
        /rgb\((\d+),\s*(\d+),\s*(\d+)\)/,
      )
      if (matches) {
        setRgbValues({
          r: parseInt(matches[1], 10),
          g: parseInt(matches[2], 10),
          b: parseInt(matches[3], 10),
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
    try {
      await onSave(values) // Errors are handled in the parent component
    } finally {
      setIsSaving(false)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (instanceNameError && e.target.value.trim()) {
      setInstanceNameError(null)
    }
    const newValues = { ...values, instance_name: e.target.value }
    onValuesChange(newValues)
  }

  const handleColorSelect = (color: string) => {
    onValuesChange({ ...values, instance_rgb: color })
    setShowCustomColor(false)
  }

  const handleCustomColorSelect = () => {
    setShowCustomColor(true)
    onValuesChange({ ...values, instance_rgb: rgbColorString })
  }

  const handleRgbChange = (component: "r" | "g" | "b", value: number) => {
    const nextValue = Number.isFinite(value)
      ? Math.min(255, Math.max(0, value))
      : 0
    const newValues = { ...rgbValues, [component]: nextValue }
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
            <FormLabel htmlFor="instance-name-input">
              Instance name <RequiredMark aria-hidden="true">*</RequiredMark>
            </FormLabel>
            <StyledInput
              id="instance-name-input"
              name="instance-name"
              data-hook="topbar-instance-name-input"
              value={values.instance_name ?? ""}
              onChange={handleNameChange}
              placeholder="Enter instance name"
              autoComplete="off"
              variant={instanceNameError ? "error" : undefined}
              aria-invalid={instanceNameError != null}
              aria-describedby={
                instanceNameError ? "instance-name-error" : undefined
              }
              ref={inputRef}
            />
            {instanceNameError && (
              <ErrorText id="instance-name-error">
                {instanceNameError}
              </ErrorText>
            )}
          </FormGroup>
          <FormGroup>
            <FormLabel htmlFor="instance-type-select">Instance type</FormLabel>
            <SelectMenuControl
              id="instance-type-select"
              dataHook="topbar-instance-type-select"
              name="Instance type"
              options={[
                {
                  label: "Development",
                  value: "development",
                  icon: <InstanceTypeIcon instanceType="development" />,
                  dataHook: "topbar-instance-type-option-development",
                },
                {
                  label: "Production",
                  value: "production",
                  icon: <InstanceTypeIcon instanceType="production" />,
                  dataHook: "topbar-instance-type-option-production",
                },
                {
                  label: "Testing",
                  value: "testing",
                  icon: <InstanceTypeIcon instanceType="testing" />,
                  dataHook: "topbar-instance-type-option-testing",
                },
              ]}
              value={values.instance_type ?? "development"}
              modal={false}
              onValueChange={(value) =>
                onValuesChange({
                  ...values,
                  instance_type: value as InstanceType,
                })
              }
            />
          </FormGroup>
          <FormGroup>
            <FormLabel htmlFor="instance-description-input">
              Description
            </FormLabel>
            <TextArea
              id="instance-description-input"
              name="instance-description"
              data-hook="topbar-instance-description-input"
              value={values.instance_description ?? ""}
              onChange={(e) =>
                onValuesChange({
                  ...values,
                  instance_description: e.target.value,
                })
              }
              placeholder="Enter instance description"
              autoComplete="off"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel as="span" id="instance-color-label">
              Color
            </FormLabel>
            <ColorSelector role="group" aria-labelledby="instance-color-label">
              <ColorOption
                type="button"
                $colorValue="default"
                $selected={!values.instance_rgb || values.instance_rgb === ""}
                onClick={() => handleColorSelect("")}
                data-hook="topbar-instance-color-option-default"
                aria-label="Default color"
                aria-pressed={
                  !values.instance_rgb || values.instance_rgb === ""
                }
              />
              <ColorOption
                type="button"
                $colorValue="r"
                $selected={values.instance_rgb === "r"}
                onClick={() => handleColorSelect("r")}
                data-hook="topbar-instance-color-option-r"
                aria-label="Red"
                aria-pressed={values.instance_rgb === "r"}
              />
              <ColorOption
                type="button"
                $colorValue="g"
                $selected={values.instance_rgb === "g"}
                onClick={() => handleColorSelect("g")}
                data-hook="topbar-instance-color-option-g"
                aria-label="Green"
                aria-pressed={values.instance_rgb === "g"}
              />
              <ColorOption
                type="button"
                $colorValue="b"
                $selected={values.instance_rgb === "b"}
                onClick={() => handleColorSelect("b")}
                data-hook="topbar-instance-color-option-b"
                aria-label="Blue"
                aria-pressed={values.instance_rgb === "b"}
              />
              <ColorWheelOption
                type="button"
                $selected={Boolean(values.instance_rgb?.startsWith("rgb"))}
                onClick={handleCustomColorSelect}
                data-hook="topbar-instance-color-option-custom"
                aria-label="Custom color"
                aria-pressed={Boolean(values.instance_rgb?.startsWith("rgb"))}
              />
            </ColorSelector>

            {showCustomColor && (
              <ColorPickerContainer>
                <ColorInputRow>
                  <ChannelLabel>R</ChannelLabel>
                  <ColorSlider
                    className="red"
                    value={rgbValues.r}
                    onChange={(e) =>
                      handleRgbChange("r", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-slider-r"
                  />
                  <ColorValueInput
                    value={rgbValues.r}
                    onChange={(e) =>
                      handleRgbChange("r", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-input-r"
                  />
                </ColorInputRow>
                <ColorInputRow>
                  <ChannelLabel>G</ChannelLabel>
                  <ColorSlider
                    className="green"
                    value={rgbValues.g}
                    onChange={(e) =>
                      handleRgbChange("g", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-slider-g"
                  />
                  <ColorValueInput
                    value={rgbValues.g}
                    onChange={(e) =>
                      handleRgbChange("g", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-input-g"
                  />
                </ColorInputRow>
                <ColorInputRow>
                  <ChannelLabel>B</ChannelLabel>
                  <ColorSlider
                    className="blue"
                    value={rgbValues.b}
                    onChange={(e) =>
                      handleRgbChange("b", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-slider-b"
                  />
                  <ColorValueInput
                    value={rgbValues.b}
                    onChange={(e) =>
                      handleRgbChange("b", parseInt(e.target.value, 10))
                    }
                    data-hook="topbar-instance-color-input-b"
                  />
                </ColorInputRow>
              </ColorPickerContainer>
            )}
          </FormGroup>
          <Buttons>
            <Button
              type="button"
              onClick={() => onToggle(false)}
              variant="secondary"
              data-hook="topbar-instance-cancel-button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              prefixIcon={isSaving ? <Loader /> : undefined}
              disabled={isSaving}
              data-hook="topbar-instance-save-button"
            >
              Save
            </Button>
          </Buttons>
        </StyledForm>
      </Wrapper>
    </PopperToggle>
  )
}
