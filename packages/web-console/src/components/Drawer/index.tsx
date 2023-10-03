import React from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css } from "styled-components"
import { ForwardRef, Heading, Overlay } from "@questdb/react-components"
import { Close } from "styled-icons/remix-line"
import { GroupHeader } from "./group-header"
import { GroupItem } from "./group-item"
import { Actions } from "./actions"
import { ContentWrapper } from "./content-wrapper"

type DrawerProps = {
  mode?: "modal" | "side"
  children: React.ReactNode
  title?: React.ReactNode
  trigger: React.ReactNode
  width?: string
  open?: boolean
  onOpenChange?: (isOpen: boolean) => void
  onDismiss?: () => void
  withCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
}

const animateShow = css`
  @keyframes animateShow {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
`

const animateHide = css`
  @keyframes animateHide {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(100%);
    }
  }
`

const DrawerContent = styled(RadixDialog.Content).attrs({ forceMount: true })<{
  width?: string
  mode: DrawerProps["mode"]
}>`
  background-color: ${({ theme }) => theme.color.background};
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
  position: ${({ mode }) => (mode === "modal" ? "fixed" : "inherit")};
  top: 0;
  right: 0;
  width: ${({ width }) => width ?? "50rem"};
  max-width: 100%;
  height: 100%;
  overflow: auto;
  border-left: 1px ${({ theme }) => theme.color.selection} solid;
  z-index: 101;

  ${animateShow}
  ${animateHide}

  ${({ mode }) =>
    mode === "modal" &&
    `
  &[data-state="open"] {
    animation: animateShow 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &[data-state="closed"] {
    animation: animateHide 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:focus {
    outline: none;
  }
  `};
`

const StyledClose = styled(RadixDialog.Close).attrs({
  "aria-label": "Close",
  asChild: true,
})`
  appearance: initial;
  margin-left: auto;
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};
`

const Header = styled.div`
  display: flex;
  padding: 2rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.1rem ${({ theme }) => theme.color.background} solid;
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
`

export const Drawer = ({
  mode = "modal",
  children,
  trigger,
  title,
  width,
  open,
  onOpenChange,
  onDismiss,
  withCloseButton,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: DrawerProps) => {
  return (
    <RadixDialog.Root
      onOpenChange={onOpenChange}
      open={open}
      modal={mode === "modal"}
    >
      <RadixDialog.Trigger asChild>
        <ForwardRef>{trigger}</ForwardRef>
      </RadixDialog.Trigger>
      <RadixDialog.Portal
        {...(mode === "side" && {
          container: document.getElementById("side-panel-right"),
        })}
      >
        {mode === "modal" && (
          <ForwardRef>
            <Overlay primitive={RadixDialog.Overlay} />
          </ForwardRef>
        )}
        <DrawerContent
          mode={mode}
          width={width}
          {...(onDismiss && {
            onEscapeKeyDown: closeOnEscape ? onDismiss : undefined,
            onInteractOutside: closeOnOverlayClick ? onDismiss : undefined,
          })}
          {...(mode === "side" && {
            onInteractOutside: (e) => e.preventDefault(),
            onEscapeKeyDown: (e) => e.preventDefault(),
            onPointerDownOutside: (e) => e.preventDefault(),
          })}
        >
          {(title || withCloseButton) && (
            <Header>
              {title && <Heading level={5}>{title}</Heading>}
              {withCloseButton && (
                <StyledClose {...(onDismiss ? { onClick: onDismiss } : {})}>
                  <Close size="18px" />
                </StyledClose>
              )}
            </Header>
          )}
          {children}
        </DrawerContent>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

Drawer.GroupHeader = GroupHeader
Drawer.GroupItem = GroupItem
Drawer.Actions = Actions
Drawer.ContentWrapper = ContentWrapper
