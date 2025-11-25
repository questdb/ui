import React, { useCallback, useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import styled, { css } from "styled-components"
import { Button } from "../../Button"
import { Input as UnstyledInput } from "../../Input"
import { Eye, EyeOff } from "@styled-icons/remix-line"

export type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  placeholder?: string
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"]
  showPassword?: boolean
  autoFocus?: boolean
  autoComplete?: string
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
  ${(props) => props.disabled && `opacity: 0.7;`}
  ${({ $inputType }) =>
    $inputType === "password" &&
    css`
      width: calc(100% + 3.2rem);
      padding-right: 4.2rem !important;
    `}
`

const ToggleButton = styled(Button)`
  cursor: pointer;
  border-radius: 0;
  position: absolute;
  right: 1.2rem;
  padding: 0;

  &:hover {
    background: transparent !important;

    svg {
      color: ${({ theme }) => theme.color.foreground};
    }
  }
`

export const FormInput = ({
  name,
  placeholder,
  type = "text",
  disabled,
  showPassword,
  autoFocus,
  autoComplete,
  ...rest
}: FormInputProps) => {
  const { register, setFocus } = useFormContext()

  const [passwordShown, setPasswordShown] = useState(showPassword)

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
        {...rest}
      />
      {type === "password" && (
        <ToggleButton
          skin="transparent"
          onClick={handleTogglePassword}
          title="Toggle password visibility"
          type="button"
        >
          {passwordShown ? <Eye size="20px" /> : <EyeOff size="20px" />}
        </ToggleButton>
      )}
    </Wrapper>
  )
}
