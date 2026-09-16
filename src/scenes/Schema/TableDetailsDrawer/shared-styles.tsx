import styled, { css } from "styled-components"
import { CaretRightIcon } from "@phosphor-icons/react"
import { Box, Text } from "../../../components"

export const Section = styled(Box).attrs<{
  $squishBottom?: boolean
  $squishTop?: boolean
}>({
  flexDirection: "column",
  gap: "2rem",
  align: "stretch",
})<{ $squishBottom?: boolean; $squishTop?: boolean }>`
  padding: 2rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.surfaceRaised};
  width: 100%;
  ${({ $squishBottom }) =>
    $squishBottom &&
    css`
      padding-bottom: 0.2rem;
      border-bottom: none;
    `}
  ${({ $squishTop }) =>
    $squishTop &&
    css`
      padding-top: 0;
      border-top: none;
    `}
`

export const HorizontalSection = styled(Section)`
  flex-direction: row;
  justify-content: space-between;
`

export const SectionTitleContainer = styled(Box).attrs({
  gap: "0.5rem",
  align: "center",
})`
  width: 100%;
`

export const SectionTitle = styled(Text).attrs({
  color: "contentPrimary",
  size: "lg",
  weight: 600,
})`
  svg {
    flex-shrink: 0;
  }
`

export const SectionTitleClickable = styled(SectionTitle)`
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  user-select: none;
`

export const CaretIcon = styled(CaretRightIcon)<{ $expanded?: boolean }>`
  transition: transform 150ms ease;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
`

export const TimestampUnderline = styled.span`
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const UnavailableValue = styled.span.attrs({
  children: "Unavailable",
})`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.md};
`

export const MetricsGrid = styled.div<{
  $columns?: number
  $attachedToRowCount?: boolean
}>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${({ $columns = 2 }) => $columns}, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
  ${({ $attachedToRowCount }) =>
    $attachedToRowCount &&
    css`
      border-top-left-radius: 0 !important;
      border-top-right-radius: 0 !important;
    `}
`

export const MetricCard = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.3rem",
  align: "flex-start",
  justifyContent: "space-between",
})`
  padding: 1rem 1.5rem;
  background: ${({ theme }) => theme.color.surfaceValue};
`

export const MetricLabel = styled(Text).attrs({
  color: "contentSecondary",
  size: "sm",
})``

export const MetricValue = styled(Text).attrs({
  color: "contentPrimary",
  size: "md",
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  padding: 4rem;
  height: 100%;
`

export const EmptyState = styled(Box).attrs({
  flexDirection: "column",
  align: "flex-start",
  justifyContent: "center",
})`
  gap: 1.2rem;
  padding: 1.8rem;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 40rem;
  margin: 0 auto;
  width: 100%;
`

export const EmptyStateHeading = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  text-align: left;
  color: ${({ theme }) => theme.color.contentPrimary};
  margin: 0;
`

export const EmptyStateSubheading = styled.p`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-align: left;
  margin: 0;
  line-height: 1.5;
`
