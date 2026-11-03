import styled from "styled-components"
import {
  BUTTON_HEIGHTS,
  ButtonBase,
  Input,
  SearchableSelect,
  SelectMenuControl,
} from "../../../../components"
import type { HighlightColorToken } from "../../../../components/ResultGrid/highlight"
import { Field } from "../CellChart/chartSettingsStyles"

const CONTROL_HEIGHT = BUTTON_HEIGHTS.sm
const CONTROL_FONT_SIZE = "1.2rem"
const SWATCH_SIZE = "2rem"

export const SectionHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem 0.8rem;
  margin-bottom: 0.8rem;
`

export const SectionTitle = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

export const SectionHint = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

export const StatusLine = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.8rem;
  font-size: 1.1rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.statusWarning};

  svg {
    flex-shrink: 0;
  }
`

export const RuleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const RuleCard = styled.div<{ $expanded: boolean }>`
  min-width: 0;
  border: 0;
  border-radius: 0.6rem;
  background: ${({ theme, $expanded }) =>
    $expanded ? theme.color.interactionHover : "transparent"};
  transition: background-color 120ms ease;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

export const RuleHead = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem;
  border-radius: inherit;
`

export const RuleSummaryButton = styled(ButtonBase)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
  min-width: 0;
  padding: 0.4rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  text-align: left;

  &[data-disabled="true"] > span {
    opacity: 0.45;
  }
`

export const SummaryCopy = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow-wrap: anywhere;
`

export const SummaryTitle = styled.span`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

export const SummaryDetails = styled.span`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`

export const SummarySwatches = styled.span`
  display: flex;
  flex-shrink: 0;
  gap: 0.2rem;
`

export const SummarySwatch = styled.span<{ $color: HighlightColorToken }>`
  display: inline-block;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 0.3rem;
  background: ${({ theme, $color }) => theme.color[$color]};
`

export const RuleEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 0.4rem 1.2rem 1.2rem;
`

export const RuleField = styled(Field)`
  min-width: 0;
`

export const RuleFields = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;

  > :first-child {
    flex: 1 1 12rem;
  }

  > :last-child {
    flex: 1.6 1 20rem;
  }
`

export const RuleParameters = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: 0.8rem;

  &:empty {
    display: none;
  }

  > :only-child {
    grid-column: 1 / -1;
  }
`

export const RuleAppearance = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1.6rem;
  padding-top: 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};

  > ${RuleField} {
    width: 10rem;
    max-width: 100%;
  }
`

// "Permanent" needs the extra width; the other selects hold shorter words.
export const DisplayField = styled(RuleField)`
  && {
    width: 11.5rem;
  }
`

export const RuleColors = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;
  min-height: ${CONTROL_HEIGHT};
`

export const CompactSelect = styled(SelectMenuControl).attrs({
  labelFontSize: CONTROL_FONT_SIZE,
})`
  && {
    height: ${CONTROL_HEIGHT};
    min-height: ${CONTROL_HEIGHT};
    padding: 0 0.8rem;
  }
`

export const ColumnPicker = styled(SearchableSelect)`
  && {
    height: ${CONTROL_HEIGHT};
    min-height: ${CONTROL_HEIGHT};
    border-radius: 0.4rem;
  }
`

export const CompactInput = styled(Input)`
  && {
    height: ${CONTROL_HEIGHT};
    min-width: 0;
    width: 100%;
    padding: 0 0.8rem;
    font-size: ${CONTROL_FONT_SIZE};
    border-radius: 0.4rem;
  }
`

export const SwatchButton = styled(ButtonBase)<{ $color: string }>`
  flex: 0 0 ${SWATCH_SIZE};
  width: ${SWATCH_SIZE};
  height: ${SWATCH_SIZE};
  padding: 0;
  border-radius: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  background: ${({ $color }) => $color};
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ $color }) => $color};
    outline: 2px solid ${({ theme }) => theme.color.interactionSelected};
    outline-offset: 1px;
  }
`

export const StepLine = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  > input {
    flex: 1;
    min-width: 0;
  }

  > span:first-child {
    flex: 0 0 1.4rem;
    text-align: right;
  }
`

export const StepLabel = styled.span`
  font-size: 1.2rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const StepRemainder = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// Keeps the otherwise-row swatch under the step swatches, which sit next to
// a remove button.
export const StepActionSlot = styled.span`
  flex: 0 0 ${BUTTON_HEIGHTS.sm};
`

export const AddRow = styled.div`
  display: flex;
  gap: 0.6rem;
  margin-top: 0.8rem;
`

export const FieldError = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.statusDanger};
`

export const RuleAlert = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.color.statusDanger};
`

export const ValidationSummary = styled.span`
  align-self: center;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.statusDanger};
`
