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
  border-bottom: 1px solid ${({ theme }) => theme.color.backgroundLighter};
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
  color: "foreground",
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
