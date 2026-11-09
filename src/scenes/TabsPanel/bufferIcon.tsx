import React from "react"
import styled from "styled-components"
import { FileTextIcon, GitDiffIcon, NotebookIcon } from "@phosphor-icons/react"
import { LineChart } from "../../components/icons"
import type { Buffer } from "../../store/buffers"
import type { Color } from "types"

const ICON_SIZE = "16px"

const Icon = styled.span<{ $color: Color }>`
  display: inline-flex;
  flex-shrink: 0;
  color: ${({ theme, $color }) => theme.color[$color]};
`

const iconFor = (buffer: Buffer): { color: Color; glyph: React.ReactNode } => {
  if (buffer.metricsViewState) {
    return { color: "statusInfo", glyph: <LineChart size={ICON_SIZE} /> }
  }
  if (buffer.notebookViewState) {
    return { color: "statusInfo", glyph: <NotebookIcon size={ICON_SIZE} /> }
  }
  if (buffer.isPreviewBuffer) {
    return {
      color: "contentSecondary",
      glyph: <GitDiffIcon size={ICON_SIZE} />,
    }
  }
  return { color: "contentPrimary", glyph: <FileTextIcon size={ICON_SIZE} /> }
}

export const BufferIcon = ({ buffer }: { buffer: Buffer }) => {
  const { color, glyph } = iconFor(buffer)
  return <Icon $color={color}>{glyph}</Icon>
}
