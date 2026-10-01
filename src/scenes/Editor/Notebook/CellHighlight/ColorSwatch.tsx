import React, { useState } from "react"
import { useTheme } from "styled-components"
import { ColorPalette, Popover } from "../../../../components"
import {
  highlightColorTokens,
  hueOfToken,
  type HighlightColorToken,
} from "../../../../components/ResultGrid/highlight"
import { SwatchButton } from "./highlightSettingsStyles"

type Props = {
  value: HighlightColorToken
  label: string
  onChange: (token: HighlightColorToken) => void
}

export const ColorSwatch: React.FC<Props> = ({ value, label, onChange }) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      trigger={
        <SwatchButton
          type="button"
          aria-label={`${label}: ${hueOfToken(value)}`}
          title={`${label}: ${hueOfToken(value)}`}
          $color={theme.color[value]}
        />
      }
    >
      <ColorPalette
        tokens={highlightColorTokens}
        labelFor={hueOfToken}
        selectedToken={value}
        onSelect={(token) => {
          onChange(token)
          setOpen(false)
        }}
      />
    </Popover>
  )
}
