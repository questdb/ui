import React from "react"
import styled from "styled-components"
import { useFormContext, FieldError } from "react-hook-form"
import { Text } from "../../../components/Text"

type Props = {
  name: string
  label?: React.ReactNode
  afterLabel?: React.ReactNode
  helperText?: React.ReactNode
  children: React.ReactNode
  className?: string
  disabled?: boolean
  border?: boolean
  required?: boolean
}

const Root = styled.div<Pick<Props, "disabled" | "border">>`
  display: grid;
  gap: 1rem;
  white-space: normal;
  width: 100%;

  ${({ border, theme }) =>
    border &&
    `
    border-bottom: 1px ${theme.color.background} solid;
  `}
`

const Control = styled.div<Pick<Props, "disabled">>`
  display: grid;
  gap: 1rem;
  ${(props) => props.disabled && `opacity: 0.7;`}
`

const LabelWrapper = styled.div`
  display: flex;
  align-self: center;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
`

const Label = styled.label<{ htmlFor: string }>`
  color: ${({ theme }) => theme.color.gray2};
`

const AfterLabel = styled.span`
  color: ${({ theme }) => theme.color.gray2};
`

export const FormItem = ({
  name,
  label,
  afterLabel,
  helperText,
  children,
  className,
  disabled,
  border,
  required,
}: Props) => {
  const {
    formState: { errors },
  } = useFormContext()

  const error = errors[name] as FieldError | undefined

  return (
    <Root className={className} disabled={disabled} border={border}>
      <Control disabled={disabled}>
        {label && name && (
          <LabelWrapper>
            <Label htmlFor={name}>
              {label}
              {required ? <Text color="red"> *</Text> : ""}
            </Label>
            <AfterLabel>{afterLabel}</AfterLabel>
          </LabelWrapper>
        )}
        {children}
      </Control>

      {name &&
        !error &&
        helperText &&
        (typeof helperText === "string" ? (
          <Text color="comment">{helperText}</Text>
        ) : (
          helperText
        ))}

      {name && error && <Text color="red">{error.message}</Text>}
    </Root>
  )
}
