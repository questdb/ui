import React from "react"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react"
import styled from "styled-components"

import { Button, TOOLBAR_CONTROL_HEIGHT, type ButtonProps } from "../Button"
import { menuContainerStyles, menuItemStyles } from "../menuStyles"

type TriggerButtonProps = Omit<
  ButtonProps,
  | "children"
  | "leadingIcon"
  | "trailingIcon"
  | "prefixIcon"
  | "variant"
  | "size"
> & {
  label: React.ReactNode
  description?: React.ReactNode
  leadingIcon?: React.ReactNode
  rich?: boolean
  minWidth?: string
  labelFontSize?: string
}

const TriggerCaret = styled(CaretDownIcon)`
  flex-shrink: 0;
  transition: transform 120ms ease;
`

const TriggerRoot = styled(Button).attrs({ variant: "secondary" })<{
  $rich?: boolean
  $minWidth?: string
}>`
  width: ${({ fullWidth }) => (fullWidth ? "100%" : "auto")};
  min-width: ${({ $minWidth }) => $minWidth ?? "auto"};
  height: ${({ $rich }) => ($rich ? "5.5rem" : TOOLBAR_CONTROL_HEIGHT)};
  padding: ${({ $rich }) => ($rich ? "0.6rem 1.2rem" : "0 1.2rem")};
  justify-content: flex-start;
  gap: 0.8rem;
  text-align: left;

  &[aria-expanded="true"] {
    border-color: ${({ theme }) => theme.color.borderAccent};
  }

  &[aria-expanded="true"] ${TriggerCaret} {
    transform: rotate(180deg);
  }
`

const TriggerIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;

  svg {
    width: 1.6rem;
    height: 1.6rem;
  }
`

const TriggerCopy = styled.span`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
`

const TriggerLabel = styled.span<{ $rich?: boolean; $fontSize?: string }>`
  max-width: 100%;
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: ${({ $rich, $fontSize }) =>
    $fontSize ?? ($rich ? "1.4rem" : "1.2rem")};
  font-weight: ${({ $rich }) => ($rich ? 500 : 400)};
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TriggerDescription = styled.span`
  max-width: 100%;
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const SelectMenuTriggerButton = React.forwardRef<
  HTMLButtonElement,
  TriggerButtonProps
>(
  (
    {
      label,
      description,
      leadingIcon,
      rich = false,
      minWidth,
      labelFontSize,
      ...props
    },
    ref,
  ) => (
    <TriggerRoot
      {...props}
      ref={ref}
      size={rich ? "lg" : "md"}
      $rich={rich}
      $minWidth={minWidth}
    >
      {leadingIcon != null && <TriggerIcon>{leadingIcon}</TriggerIcon>}
      <TriggerCopy>
        <TriggerLabel $rich={rich} $fontSize={labelFontSize}>
          {label}
        </TriggerLabel>
        {description != null && (
          <TriggerDescription>{description}</TriggerDescription>
        )}
      </TriggerCopy>
      <TriggerCaret size={16} aria-hidden="true" />
    </TriggerRoot>
  ),
)

SelectMenuTriggerButton.displayName = "SelectMenuTriggerButton"

const Trigger = React.forwardRef<HTMLButtonElement, TriggerButtonProps>(
  (props, ref) => (
    <RadixDropdownMenu.Trigger asChild>
      <SelectMenuTriggerButton {...props} ref={ref} />
    </RadixDropdownMenu.Trigger>
  ),
)

Trigger.displayName = "SelectMenuTrigger"

const ContentRoot = styled(RadixDropdownMenu.Content)<{
  $minWidth?: string
}>`
  ${menuContainerStyles}
  min-width: ${({ $minWidth }) => $minWidth ?? "16rem"};
  max-width: min(42rem, calc(100vw - 2rem));
  max-height: min(50vh, 42rem);
  overflow-y: auto;
`

type ContentProps = React.ComponentPropsWithoutRef<typeof ContentRoot> & {
  minWidth?: string
}

const Content = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Content>,
  ContentProps
>(({ minWidth, ...props }, ref) => (
  <ContentRoot {...props} ref={ref} $minWidth={minWidth} />
))

Content.displayName = "SelectMenuContent"

const ItemRoot = styled(RadixDropdownMenu.RadioItem)<{ $hasIcon: boolean }>`
  ${menuItemStyles}
  display: grid;
  grid-template-columns: ${({ $hasIcon }) =>
    $hasIcon ? "1.8rem minmax(0, 1fr) 1.8rem" : "minmax(0, 1fr) 1.8rem"};
  gap: 0.8rem;
  padding: 0.7rem 0.8rem;

  &[data-state="checked"] {
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const ItemIcon = styled.span`
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentSecondary};

  svg {
    width: 1.6rem;
    height: 1.6rem;
  }
`

const ItemCopy = styled.span`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
`

const ItemLabel = styled.span`
  color: inherit;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.35;
`

const ItemDescription = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.4;
`

const IndicatorSlot = styled.span`
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentAccent};
`

const ItemIndicator = styled(RadixDropdownMenu.ItemIndicator)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

type ItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.RadioItem>,
  "children"
> & {
  children: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  // Shares the checkmark's slot: a row showing one is never the checked row.
  indicator?: React.ReactNode
}

const Item = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.RadioItem>,
  ItemProps
>(({ children, description, icon, indicator, ...props }, ref) => (
  <ItemRoot {...props} ref={ref} $hasIcon={icon != null}>
    {icon != null && <ItemIcon>{icon}</ItemIcon>}
    <ItemCopy>
      <ItemLabel>{children}</ItemLabel>
      {description != null && <ItemDescription>{description}</ItemDescription>}
    </ItemCopy>
    <IndicatorSlot>
      <ItemIndicator>
        <CheckIcon size={16} weight="bold" />
      </ItemIndicator>
      {indicator}
    </IndicatorSlot>
  </ItemRoot>
))

Item.displayName = "SelectMenuItem"

const Label = styled(RadixDropdownMenu.Label)`
  padding: 0.4rem 0.8rem 0.5rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

export type SelectMenuControlOption = {
  label: React.ReactNode
  value: string
  description?: React.ReactNode
  dataHook?: string
  icon?: React.ReactNode
}

type SelectMenuControlProps = {
  name: string
  id?: string
  value: string
  options: SelectMenuControlOption[]
  onValueChange: (value: string) => void
  placeholder?: React.ReactNode
  disabled?: boolean
  className?: string
  dataHook?: string
  labelFontSize?: string
  menuLabel?: React.ReactNode
  modal?: boolean
  onOpenChange?: (open: boolean) => void
  ariaInvalid?: React.ButtonHTMLAttributes<HTMLButtonElement>["aria-invalid"]
  ariaDescribedBy?: string
  ariaLabel?: string | null
}

/**
 * Form-sized single select using the same trigger, menu surface and selected
 * indicator as the toolbar dropdowns. Prefer this over native selects when the
 * menu is part of an application workflow rather than a browser form.
 */
export const SelectMenuControl = ({
  name,
  id,
  value,
  options,
  onValueChange,
  placeholder = "Select an option",
  disabled,
  className,
  dataHook,
  labelFontSize = "1.3rem",
  menuLabel,
  modal,
  onOpenChange,
  ariaInvalid,
  ariaDescribedBy,
  ariaLabel,
}: SelectMenuControlProps) => {
  const selectedOption = options.find((option) => option.value === value)
  const label = selectedOption?.label ?? placeholder

  return (
    <RadixDropdownMenu.Root modal={modal} onOpenChange={onOpenChange}>
      <Trigger
        id={id}
        className={className}
        dataHook={dataHook}
        label={label}
        leadingIcon={selectedOption?.icon}
        labelFontSize={labelFontSize}
        fullWidth
        disabled={disabled}
        aria-label={ariaLabel === null ? undefined : (ariaLabel ?? name)}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        title={typeof label === "string" ? label : undefined}
      />
      <RadixDropdownMenu.Portal>
        <Content
          align="start"
          sideOffset={4}
          minWidth="var(--radix-dropdown-menu-trigger-width)"
        >
          {menuLabel != null && <Label>{menuLabel}</Label>}
          <RadixDropdownMenu.RadioGroup
            value={value}
            onValueChange={onValueChange}
          >
            {options.map((option) => (
              <Item
                key={option.value}
                value={option.value}
                description={option.description}
                icon={option.icon}
                data-hook={option.dataHook}
              >
                {option.label}
              </Item>
            ))}
          </RadixDropdownMenu.RadioGroup>
        </Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}

export const SelectMenu = {
  Root: RadixDropdownMenu.Root,
  Trigger,
  TriggerButton: SelectMenuTriggerButton,
  Portal: RadixDropdownMenu.Portal,
  Content,
  RadioGroup: RadixDropdownMenu.RadioGroup,
  Item,
  Label,
  Divider: styled.div`
    height: 1px;
    background: ${({ theme }) => theme.color.interactionNeutral};
    margin: 0.5rem 0.4rem;
  `,
}
