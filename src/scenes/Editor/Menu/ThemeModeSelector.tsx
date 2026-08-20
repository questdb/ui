import React from "react"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  CaretDownIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react"
import styled from "styled-components"

import { Button, SelectMenu } from "../../../components"
import { useThemeMode } from "../../../providers"
import type { ThemeMode, ThemePreference } from "../../../types"

const TriggerIcon = styled.span`
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
`

const TriggerCaret = styled(CaretDownIcon)`
  color: ${({ theme }) => theme.color.contentSecondary};
  transition: transform 120ms ease;
`

const Trigger = styled(Button)`
  width: 5.4rem;
  min-width: 5.4rem;
  padding: 0 0.8rem;
  gap: 0.6rem;

  &[data-state="open"] {
    background: ${({ theme }) => theme.color.controlSurfaceHover};
    border-color: ${({ theme }) => theme.color.borderStrong};
  }

  &[data-state="open"] ${TriggerCaret} {
    transform: rotate(180deg);
  }
`

const getPreferenceLabel = (preference: ThemePreference, mode: ThemeMode) =>
  preference === "system" ? `System, currently ${mode}` : `${preference} theme`

export const ThemeModeSelector = () => {
  const { preference, mode, setPreference } = useThemeMode()
  const ResolvedThemeIcon = mode === "dark" ? MoonIcon : SunIcon

  return (
    <SelectMenu.Root>
      <RadixDropdownMenu.Trigger asChild>
        <Trigger
          variant="secondary"
          size="md"
          aria-label={`Theme: ${getPreferenceLabel(preference, mode)}`}
          title={`Theme: ${getPreferenceLabel(preference, mode)}`}
          dataHook="theme-mode-trigger"
        >
          <TriggerIcon>
            <ResolvedThemeIcon size={18} weight="duotone" aria-hidden="true" />
          </TriggerIcon>
          <TriggerCaret size={14} weight="bold" aria-hidden="true" />
        </Trigger>
      </RadixDropdownMenu.Trigger>

      <SelectMenu.Portal>
        <SelectMenu.Content align="end" sideOffset={6}>
          <SelectMenu.Label>Theme</SelectMenu.Label>
          <SelectMenu.RadioGroup
            value={preference}
            onValueChange={(value) => setPreference(value as ThemePreference)}
          >
            <SelectMenu.Item
              value="system"
              icon={<DesktopIcon />}
              data-hook="theme-mode-system"
            >
              System
            </SelectMenu.Item>
            <SelectMenu.Item
              value="light"
              icon={<SunIcon />}
              data-hook="theme-mode-light"
            >
              Light
            </SelectMenu.Item>
            <SelectMenu.Item
              value="dark"
              icon={<MoonIcon />}
              data-hook="theme-mode-dark"
            >
              Dark
            </SelectMenu.Item>
          </SelectMenu.RadioGroup>
        </SelectMenu.Content>
      </SelectMenu.Portal>
    </SelectMenu.Root>
  )
}
