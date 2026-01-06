import React from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css } from "styled-components"
import { GroupHeader } from "./group-header"
import { GroupItem } from "./group-item"
import { Actions } from "./actions"
import { ForwardRef, Overlay } from "../../components"
import { Button } from "../Button"
import { ContentWrapper } from "./content-wrapper"
import { Panel } from "../../components/Panel"
import { XIcon } from "@phosphor-icons/react"

type DrawerProps = {
  mode?: "modal" | "side"
  children: React.ReactNode
  title?: React.ReactNode
  afterTitle?: React.ReactNode
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
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.color.chatBackground};
  border-left: 0.2rem ${({ theme }) => theme.color.background} solid;
  position: ${({ mode }) => (mode === "modal" ? "fixed" : "inherit")};
  top: 0;
  right: 0;
  max-width: 100%;
  width: ${({ mode, width }) => width ?? (mode === "side" ? "100%" : "52rem")};
  height: 100%;
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

export const StyledClose = styled(Button).attrs({
  "aria-label": "Close",
  skin: "transparent",
})`
  margin-left: auto;
  margin-right: 0.5rem;
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};
  padding: 0.6rem;
`

export const Drawer = ({
  mode = "modal",
  children,
  trigger,
  title,
  afterTitle,
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
            <Panel.Header
              title={title}
              afterTitle={afterTitle}
              {...(withCloseButton && {
                afterTitle: (
                  <StyledClose {...(onDismiss ? { onClick: onDismiss } : {})}>
                    <XIcon size={16} weight="bold" />
                  </StyledClose>
                ),
              })}
            />
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
