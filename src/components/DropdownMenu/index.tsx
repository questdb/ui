import React from "react"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { CaretRightIcon, CheckIcon } from "@phosphor-icons/react"
import styled from "styled-components"
import {
  menuContainerStyles,
  menuItemStyles,
  MenuItemIcon,
  MenuItemBody,
  MenuItemSubtitle,
} from "../menuStyles"

const Content = styled(RadixDropdownMenu.Content)`
  ${menuContainerStyles}
`

const SubContent = styled(RadixDropdownMenu.SubContent)`
  ${menuContainerStyles}
`

const StyledItem = styled(RadixDropdownMenu.Item)`
  ${menuItemStyles}
`

const StyledRadioItem = styled(RadixDropdownMenu.RadioItem)`
  ${menuItemStyles}

  &[data-state="checked"] {
    background: ${({ theme }) => theme.color.background};
  }
`

// The checked background alone is the same token as the highlighted one, so
// selection and keyboard focus are otherwise indistinguishable. The slot is
// always rendered to keep every label on one left edge.
const RadioItemIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.4rem;
  color: ${({ theme }) => theme.color.pinkPrimary};

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

type RadioItemProps = React.ComponentPropsWithoutRef<
  typeof RadixDropdownMenu.RadioItem
> & {
  // Shares the checkmark's slot: a row showing one is never the checked row.
  indicator?: React.ReactNode
}

const RadioItem = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.RadioItem>,
  RadioItemProps
>(({ indicator, children, ...props }, ref) => (
  <StyledRadioItem ref={ref} {...props}>
    <RadioItemIndicator>
      <RadixDropdownMenu.ItemIndicator>
        <CheckIcon weight="bold" />
      </RadixDropdownMenu.ItemIndicator>
      {indicator}
    </RadioItemIndicator>
    {children}
  </StyledRadioItem>
))

RadioItem.displayName = "DropdownMenuRadioItem"

type ItemProps = React.ComponentPropsWithoutRef<
  typeof RadixDropdownMenu.Item
> & {
  icon?: React.ReactNode
  subtitle?: React.ReactNode
}

const Item = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.Item>,
  ItemProps
>(({ icon, subtitle, children, ...props }, ref) => {
  if (props.asChild) {
    return (
      <StyledItem ref={ref} {...props}>
        {children}
      </StyledItem>
    )
  }
  return (
    <StyledItem ref={ref} {...props}>
      {icon != null && <MenuItemIcon>{icon}</MenuItemIcon>}
      {subtitle != null ? (
        <MenuItemBody>
          {children}
          <MenuItemSubtitle>{subtitle}</MenuItemSubtitle>
        </MenuItemBody>
      ) : (
        children
      )}
    </StyledItem>
  )
})

Item.displayName = "DropdownMenuItem"

const StyledSubTrigger = styled(RadixDropdownMenu.SubTrigger)`
  ${menuItemStyles}
  justify-content: space-between;

  &[data-state="open"] {
    background: ${({ theme }) => theme.color.background};
  }
`

const SubTriggerLabel = styled.span`
  display: flex;
  gap: 0.6rem;
  align-items: center;
`

const SubTrigger = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenu.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubTrigger>
>(({ children, ...props }, ref) => (
  <StyledSubTrigger ref={ref} {...props}>
    <SubTriggerLabel>{children}</SubTriggerLabel>
    <CaretRightIcon size={16} />
  </StyledSubTrigger>
))

SubTrigger.displayName = "DropdownMenuSubTrigger"

export const DropdownMenu = {
  Root: RadixDropdownMenu.Root,

  Trigger: styled(RadixDropdownMenu.Trigger)`
    cursor: pointer;
  `,

  Portal: styled(RadixDropdownMenu.Portal)``,

  Content,

  Arrow: styled(RadixDropdownMenu.Arrow)`
    fill: ${({ theme }) => theme.color.black40};
  `,

  Item,

  RadioGroup: RadixDropdownMenu.RadioGroup,

  RadioItem,

  Sub: RadixDropdownMenu.Sub,

  SubTrigger,

  SubContent,

  Divider: styled.div`
    height: 1px;
    background: ${({ theme }) => theme.color.selection};
    margin: 0.5rem 0.4rem;
  `,
}
