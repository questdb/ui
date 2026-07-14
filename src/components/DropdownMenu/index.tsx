import React from "react"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { CaretRightIcon } from "@phosphor-icons/react"
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

const RadioItem = styled(RadixDropdownMenu.RadioItem)`
  ${menuItemStyles}

  &[data-state="checked"] {
    background: ${({ theme }) => theme.color.background};
  }
`

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
