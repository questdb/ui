import React from "react"
import styled, { css } from "styled-components"
import { DropdownMenu } from "../../../../components"
import { AUTO_REFRESH_OPTIONS, autoRefreshLabel } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"

const Option = styled(DropdownMenu.Item)<{ $active?: boolean }>`
  ${({ $active, theme }) =>
    $active &&
    css`
      background: ${theme.color.background};
    `}
`

type Props = {
  value: AutoRefresh
  onSelect: (value: AutoRefresh) => void
}

export const AutoRefreshOptions: React.FC<Props> = ({ value, onSelect }) => (
  <>
    {AUTO_REFRESH_OPTIONS.map((option) => (
      <Option
        key={String(option)}
        $active={option === value}
        onSelect={() => onSelect(option)}
      >
        {autoRefreshLabel(option)}
      </Option>
    ))}
  </>
)
