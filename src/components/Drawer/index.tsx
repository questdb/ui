import React from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css } from "styled-components"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { GroupHeader } from "./group-header"
import { GroupItem } from "./group-item"
import { Actions } from "./actions"
import { ForwardRef, Overlay } from "../../components"
import { Button } from "../Button"
import { ContentWrapper } from "./content-wrapper"
import { Panel } from "../../components/Panel"
import { XIcon, ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react"

type DrawerProps = {
  mode?: "modal" | "side"
  "data-hook"?: string
  children: React.ReactNode
  title?: React.ReactNode
  titleColor?: string
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
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};
  padding: 0.6rem;
`

export const AfterTitleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
`

const NavigationButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`

const NavButton = styled(Button)`
  padding: 0.4rem;
`

const TitleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
`

export const Drawer = ({
  mode = "modal",
  children,
  trigger,
  title,
  titleColor,
  afterTitle,
  width,
  open,
  onOpenChange,
  onDismiss,
  withCloseButton,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  "data-hook": dataHook,
}: DrawerProps) => {
  const dispatch = useDispatch()
  const canGoBack = useSelector(selectors.console.canGoBackInSidebar)
  const canGoForward = useSelector(selectors.console.canGoForwardInSidebar)

  const handleNavigateBack = () => {
    dispatch(actions.console.goBackInSidebar())
  }

  const handleNavigateForward = () => {
    dispatch(actions.console.goForwardInSidebar())
  }

  const showNavigation = mode === "side" && (canGoBack || canGoForward)

  const titleWithNavigation =
    mode === "side" ? (
      <TitleWrapper>
        {showNavigation && (
          <NavigationButtons>
            <NavButton
              skin="transparent"
              title="Go back"
              disabled={!canGoBack}
              onClick={handleNavigateBack}
              data-hook="sidebar-back-button"
            >
              <ArrowLeftIcon size={16} weight="bold" />
            </NavButton>
            <NavButton
              skin="transparent"
              title="Go forward"
              disabled={!canGoForward}
              onClick={handleNavigateForward}
              data-hook="sidebar-forward-button"
            >
              <ArrowRightIcon size={16} weight="bold" />
            </NavButton>
          </NavigationButtons>
        )}
        {title}
      </TitleWrapper>
    ) : (
      title
    )

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
          aria-describedby={undefined}
          data-hook={dataHook}
          mode={mode}
          width={width}
          {...(onDismiss && {
            onEscapeKeyDown: closeOnEscape ? onDismiss : undefined,
            onInteractOutside: closeOnOverlayClick ? onDismiss : undefined,
          })}
          {...(mode === "side" && {
            onInteractOutside: (e) => e.preventDefault(),
            onEscapeKeyDown:
              closeOnEscape && onDismiss
                ? onDismiss
                : (e) => e.preventDefault(),
            onPointerDownOutside: (e) => e.preventDefault(),
          })}
        >
          <RadixDialog.Title asChild>
            <span style={{ display: "none" }}>
              {typeof title === "string" ? title : "Drawer"}
            </span>
          </RadixDialog.Title>
          {(title || withCloseButton) && (
            <Panel.Header
              title={titleWithNavigation}
              afterTitle={afterTitle}
              titleColor={titleColor}
              {...(withCloseButton && {
                afterTitle: (
                  <AfterTitleContainer>
                    {afterTitle}
                    <StyledClose
                      {...(onDismiss ? { onClick: onDismiss } : {})}
                      data-hook="sidebar-close-button"
                    >
                      <XIcon size={16} weight="bold" />
                    </StyledClose>
                  </AfterTitleContainer>
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
