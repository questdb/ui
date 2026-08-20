import styled from "styled-components"
import * as RadixPopover from "@radix-ui/react-popover"
import type { PopoverProps } from "@radix-ui/react-popover"
import { X } from "../icons"
import React from "react"
import { Heading } from "../Heading"
import { IconButton } from "../IconButton"
import { floatingSurfaceStyles } from "../overlayStyles"

export type Align = "start" | "center" | "end"

const StyledPopoverContent = styled(RadixPopover.Content)`
  ${floatingSurfaceStyles}
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 1.6rem);
  max-height: calc(100vh - 1.6rem);
  overflow: hidden;
  z-index: 9999;
`

const PopoverCloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  margin-left: auto;
`

const Header = styled.div`
  display: flex;
  padding: 2rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.1rem ${({ theme }) => theme.color.borderSubtle} solid;
`

const ContentWrapper = styled.div`
  width: 100%;
  min-width: 0;
`

type Props = {
  children: React.ReactNode
  withCloseButton?: boolean
  trigger: React.ReactNode
  width?: number | string
  title?: string
  open?: PopoverProps["open"]
  onOpenChange?: (isOpen: boolean) => void
  align?: Align
}

export const Popover = ({
  children,
  withCloseButton = false,
  width,
  trigger,
  title,
  open,
  onOpenChange,
  align,
}: Props) => (
  <RadixPopover.Root onOpenChange={onOpenChange} open={open}>
    <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
    <RadixPopover.Portal>
      <StyledPopoverContent
        style={{ width: width ?? "auto" }}
        align={align}
        sideOffset={8}
        collisionPadding={8}
      >
        {(title || withCloseButton) && (
          <Header>
            {title && <Heading level={5}>{title}</Heading>}
            {withCloseButton && (
              <RadixPopover.Close asChild>
                <PopoverCloseButton>
                  <X size="18px" />
                </PopoverCloseButton>
              </RadixPopover.Close>
            )}
          </Header>
        )}
        <ContentWrapper>{children}</ContentWrapper>
      </StyledPopoverContent>
    </RadixPopover.Portal>
  </RadixPopover.Root>
)
