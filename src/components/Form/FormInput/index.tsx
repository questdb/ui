import React, { useCallback, useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import styled, { css } from "styled-components"
import { IconButton } from "../../IconButton"
import { Input as UnstyledInput } from "../../Input"
import { Eye, EyeOff } from "../../icons"

export type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  placeholder?: string
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"]
  showPassword?: boolean
  autoFocus?: boolean
  autoComplete?: string
  tone?: "neutral" | "accent"
}

const Wrapper = styled.div<{
  autoComplete: FormInputProps["autoComplete"]
  type: FormInputProps["type"]
}>`
  display: flex;
  width: 100%;
  position: relative;
  align-items: center;
  ${(props) =>
    props.autoComplete === "off" &&
    `
    // Hide the LastPass+NordPass icons
    [data-lastpass-icon-root],
    span[data-np-uid] {
      display: none !important;
    }
  `}
  ${(props) =>
    props.type === "password" &&
    `
    border-radius: 8px;
  `}
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-transition: "color 9999s ease-out, background-color 9999s ease-out";
    -webkit-transition-delay: 9999s;
  }
`

const Input = styled(UnstyledInput)<
  FormInputProps & { $inputType: FormInputProps["type"] }
>`
  ${({ $inputType }) =>
    $inputType === "password" &&
    css`
      width: calc(100% + 3.2rem);
      padding-right: 4.2rem !important;
    `}
`

const ToggleButton = styled(IconButton)`
  position: absolute;
  right: 1.2rem;
`

export const FormInput = ({
  name,
  placeholder,
  type = "text",
  disabled,
  showPassword,
  autoFocus,
  autoComplete,
  tone,
  ...rest
}: FormInputProps) => {
  const { formState, getFieldState, register, setFocus } = useFormContext()

  const [passwordShown, setPasswordShown] = useState(showPassword)
  const hasError = getFieldState(name, formState).error != null

  const handleTogglePassword = useCallback(() => {
    setPasswordShown(!passwordShown)
  }, [passwordShown, setPasswordShown])

  useEffect(() => {
    if (autoFocus) {
      setFocus(name)
    }
  }, [])

  return (
    <Wrapper autoComplete={autoComplete} type={type}>
      <Input
        {...register(name, {
          valueAsNumber: type === "number",
        })}
        name={name}
        placeholder={placeholder}
        type={passwordShown ? "text" : type}
        $inputType={type}
        disabled={disabled}
        showPassword={showPassword}
        autoComplete={autoComplete}
        $tone={tone}
        {...rest}
        id={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${name}-error` : undefined}
      />
      {type === "password" && (
        <ToggleButton
          label="Toggle password visibility"
          variant="ghost"
          onClick={handleTogglePassword}
          type="button"
        >
          {passwordShown ? <Eye size="20px" /> : <EyeOff size="20px" />}
        </ToggleButton>
      )}
    </Wrapper>
  )
}
