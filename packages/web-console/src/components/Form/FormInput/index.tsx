import React, { useCallback, useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import styled from "styled-components"
import { Button, Input as UnstyledInput } from "@questdb/react-components"
import { Eye, EyeOff } from "styled-icons/remix-line"

export type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  placeholder?: string
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"]
  showPassword?: boolean
  autoFocus?: boolean
}

const Wrapper = styled.div`
  display: flex;
  width: 100%;
`

const Input = styled(UnstyledInput)<FormInputProps>`
  ${(props) => props.disabled && `opacity: 0.7;`}
`

const ToggleButton = styled(Button)<{ last?: boolean }>`
  cursor: pointer;
  border-radius: 0;

  ${(props) =>
    props.last &&
    `
    border-top-right-radius: 0.4rem;
    border-bottom-right-radius: 0.4rem;
  `}
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
  const { register, setFocus, setValue } = useFormContext()

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
    <Wrapper>
      <Input
        {...register(name, {
          valueAsNumber: type === "number",
        })}
        name={name}
        placeholder={placeholder}
        type={passwordShown ? "text" : type}
        disabled={disabled}
        showPassword={showPassword}
        {...rest}
      />
      {type === "password" && (
        <ToggleButton
          skin="secondary"
          onClick={handleTogglePassword}
          title="Toggle password visibility"
          type="button"
          last
        >
          {passwordShown ? <Eye size="18px" /> : <EyeOff size="18px" />}
        </ToggleButton>
      )}
    </Wrapper>
  )
}
