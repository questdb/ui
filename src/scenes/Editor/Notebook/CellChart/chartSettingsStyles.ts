import styled, { css } from "styled-components"
import {
  MultiSelect,
  SelectMenuControl,
  TOOLBAR_CONTROL_HEIGHT,
} from "../../../../components"
import { WarningIcon } from "@phosphor-icons/react"

export const SETTINGS_CONTROL_HEIGHT = TOOLBAR_CONTROL_HEIGHT

const settingsSelectHeight = css`
  && {
    height: ${SETTINGS_CONTROL_HEIGHT};
    min-height: ${SETTINGS_CONTROL_HEIGHT};
  }
`

export const SettingsSelect = styled(SelectMenuControl)`
  ${settingsSelectHeight}
`

export const SettingsMultiSelect = styled(MultiSelect)`
  ${settingsSelectHeight}
`

export const IncompatibleIcon = styled(WarningIcon)`
  color: ${({ theme }) => theme.color.statusWarning};
  flex-shrink: 0;
`

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const FieldLabel = styled.span`
  font-size: 1.2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

export const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  cursor: pointer;
`
