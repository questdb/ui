import React, { useCallback, useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { Input as UnstyledInput } from "../../Input"
import styled from "styled-components"
import { Button } from "@questdb/react-components"
import { Eye, EyeOff, Refresh } from "styled-icons/remix-line"
import generator from "generate-password"

export type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  placeholder?: string
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"]
  generatePassword?: boolean
  generatePasswordRules?: {
    length: number
    numbers?: boolean
  }
  showPassword?: boolean
  autoFocus?: boolean
}

const Wrapper = styled.div`
  display: flex;
  width: 100%;
`

const Input = styled(UnstyledInput)<FormInputProps>`
  ${(props) =>
    (props.type === "password" || props.showPassword) &&
    `
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  `};

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
  generatePassword,
  generatePasswordRules,
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

  const regeneratePassword = useCallback(() => {
    if (!generatePasswordRules) return
    setValue(
      name,
      generator.generate({
        length: generatePasswordRules.length,
        numbers: generatePasswordRules.numbers ?? true,
      }),
      {
        shouldDirty: true,
      },
    )
    setPasswordShown(true)
  }, [])

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
      {type === "password" && generatePassword && generatePasswordRules && (
        <ToggleButton
          skin="secondary"
          onClick={regeneratePassword}
          title="Regenerate the password"
          type="button"
        >
          <Refresh size="18px" />
        </ToggleButton>
      )}
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
