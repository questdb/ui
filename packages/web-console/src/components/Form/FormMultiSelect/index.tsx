import React from "react"
import styled from "styled-components"
import { MultiSelect } from "react-multi-select-component"
import { Controller, useFormContext } from "react-hook-form"
import { Close } from "styled-icons/remix-line"
import { ChevronDown } from "styled-icons/boxicons-solid"

const Root = styled.div`
  width: 100%;

  .rmsc {
    --rmsc-main: ${({ theme }) => theme.color.pinkDarker};
    --rmsc-hover: ${({ theme }) => theme.color.background};
    --rmsc-selected: ${({ theme }) => theme.color.background};
    --rmsc-border: transparent;
    --rmsc-gray: ${({ theme }) => theme.color.gray2};
    --rmsc-bg: ${({ theme }) => theme.color.selection};
    --rmsc-p: 10px;
    --rmsc-radius: 4px;
    --rmsc-h: 30px;
    width: 100%;

    .dropdown-heading {
      padding-right: 5px;
    }

    .dropdown-container:focus-within {
      box-shadow: none;
    }
  }
`

const StyledClose = styled(Close)`
  color: ${({ theme }) => theme.color.foreground};
`

type Props = {
  name: string
  options: { label: string; value: string }[]
  labelledBy: string
  hasSelectAll?: boolean
}

export const FormMultiSelect = ({
  name,
  options,
  labelledBy,
  hasSelectAll,
}: Props) => {
  const { control } = useFormContext()

  return (
    <Root>
      <Controller
        control={control}
        name={name}
        render={({ field: { value, onChange } }) => (
          <MultiSelect
            options={options}
            value={value}
            onChange={(values: { label: string; value: string }[]) =>
              onChange(values.map((value) => value.value))
            }
            labelledBy={labelledBy}
            hasSelectAll={hasSelectAll}
            ClearIcon={<StyledClose size={18} />}
            ClearSelectedIcon={<StyledClose size={18} />}
            ArrowRenderer={() => <ChevronDown size={18} />}
          />
        )}
      />
    </Root>
  )
}
