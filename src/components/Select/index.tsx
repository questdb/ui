import React from "react"
import styled, { css } from "styled-components"
import { Input } from "../Input"
import { ArrowDropDown } from "@styled-icons/remix-line"

export type SelectProps = {
  name: string
  options: {
    label: string
    value: string | number
  }[]
  prefixIcon?: React.ReactNode
  disabled?: boolean
} & React.SelectHTMLAttributes<HTMLSelectElement | HTMLInputElement>

const Root = styled.div<{ disabled?: boolean }>`
  position: relative;
  width: 100%;

  ${({ disabled }) =>
    disabled &&
    css`
      .prefixIcon,
      .arrowDownIcon {
        opacity: 0.5;
        color: ${({ theme }) => theme.color.selection};
      }
    `}

  .prefixIcon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translate(0, -50%);
    pointer-events: none;
  }

  .arrowDownIcon {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translate(0, -50%);
    pointer-events: none;
    fill: ${({ theme }) => theme.color.white};
  }
`

const StyledSelect = styled(Input).attrs({ as: "select" })<{
  withPrefixIcon: boolean
}>`
  position: relative;
  appearance: none;
  cursor: pointer;
  width: 100%;
  padding-right: 2.4rem;

  ${({ withPrefixIcon }) => withPrefixIcon && `padding-left: 3rem;`}

  &:focus {
    border-color: ${({ theme }) => theme.color.pink};
    background: ${({ theme }) => theme.color.selection};
  }

  ${(props) =>
    props.disabled &&
    css`
      cursor: default;
      background: ${({ theme }) => theme.color.selection};
      border-color: ${({ theme }) => theme.color.gray1};
      color: ${({ theme }) => theme.color.gray1};
    `}
`

export const Select = React.forwardRef(
  ({ options, prefixIcon, ...rest }: SelectProps, ref) => (
    <Root disabled={rest.disabled}>
      <StyledSelect
        ref={ref as React.Ref<HTMLInputElement>}
        withPrefixIcon={typeof prefixIcon !== "undefined"}
        {...rest}
      >
        {options.map(({ label, value }) => (
          <option key={`${label}-${value}`} value={value}>
            {label}
          </option>
        ))}
      </StyledSelect>

      {/* dues to absolute positioning must be last to be rendered on top */}
      {prefixIcon ? <span className="prefixIcon">{prefixIcon}</span> : null}
      <ArrowDropDown className="arrowDownIcon" size="28" />
    </Root>
  ),
)

Select.displayName = "Select"
