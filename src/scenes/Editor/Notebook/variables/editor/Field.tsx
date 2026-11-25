import React from "react"
import styled from "styled-components"
import { Checkbox, Input, Text } from "../../../../../components"

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
`

export const FieldRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 1.2rem;
`

const FieldRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
`

export const MonoInput = styled(Input)`
  font-family: ${({ theme }) => theme.fontMonospace};
`

const Required = styled.span`
  margin-left: 0.3rem;
  color: ${({ theme }) => theme.color.statusDanger};
`

type FieldProps = {
  label: string
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
}

export const Field = ({ label, hint, required, children }: FieldProps) => (
  <FieldRoot>
    <Text type="label" color="contentPrimary" size="md" weight={500}>
      {label}
      {required && <Required aria-hidden="true">*</Required>}
    </Text>
    {children}
    {hint && (
      <Text size="xs" color="contentSecondary">
        {hint}
      </Text>
    )}
  </FieldRoot>
)

const CheckRow = styled.label`
  display: inline-flex;
  align-self: flex-start;
  align-items: flex-start;
  gap: 0.8rem;
  cursor: pointer;
`

const CheckText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`

type CheckboxFieldProps = {
  label: string
  hint?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  dataHook?: string
}

export const CheckboxField = ({
  label,
  hint,
  checked,
  onChange,
  dataHook,
}: CheckboxFieldProps) => (
  <CheckRow>
    <Checkbox
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      data-hook={dataHook}
    />
    <CheckText>
      <Text color="contentPrimary" size="md">
        {label}
      </Text>
      {hint && (
        <Text size="xs" color="contentSecondary">
          {hint}
        </Text>
      )}
    </CheckText>
  </CheckRow>
)
