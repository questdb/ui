import React, { useRef } from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { useEscapeLayer } from "../../hooks/useEscapeLayer"
import { FocusOnOpen } from "./focus-on-open"
import { EscapePriority, isTextFieldWithValue } from "../../utils/escapeKey"
import styled, { css } from "styled-components"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { GroupHeader } from "./group-header"
import { GroupItem } from "./group-item"
import { Actions } from "./actions"
import { ForwardRef, Overlay } from ".."
import { IconButton } from "../IconButton"
import { ContentWrapper } from "./content-wrapper"
import { Panel } from "../Panel"
import { XIcon, ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

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

const drawerContentStyles = css<{
  width?: string
  mode: DrawerProps["mode"]
}>`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.color.surfaceRaised};
  border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
  box-shadow: -4px 0 16px ${({ theme }) => theme.color.shadowSoft};
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

const DrawerContent = styled(RadixDialog.Content).attrs({ forceMount: true })`
  ${drawerContentStyles}
`

// A docked panel is not a dismissable overlay: it is an ambient Escape layer
// (utils/escapeKey.ts), closed only by an Escape that nothing inside or in
// front of it claimed. Radix's capture-phase listener would run first.
const SideDrawerContent = styled.div`
  ${drawerContentStyles}

  &:focus {
    outline: none;
  }
`

let sideDrawerSeq = 0

export const StyledClose = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
})`
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

const NavButton = styled(IconButton)`
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
    void trackEvent(ConsoleEvent.SIDEBAR_NAVIGATE)
    dispatch(actions.console.goBackInSidebar())
  }

  const handleNavigateForward = () => {
    void trackEvent(ConsoleEvent.SIDEBAR_NAVIGATE)
    dispatch(actions.console.goForwardInSidebar())
  }

  const showNavigation = mode === "side" && (canGoBack || canGoForward)

  const sideContentRef = useRef<HTMLDivElement>(null)
  // Radix's trigger points `aria-controls` at its own content element, which
  // a side panel does not render; it must name the panel instead.
  const sideContentId = useRef(`side-drawer-${++sideDrawerSeq}`).current
  useEscapeLayer(mode === "side" && !!open && closeOnEscape && !!onDismiss, {
    priority: EscapePriority.sidePanel,
    scope: () => sideContentRef.current,
    onEscape: () => {
      onDismiss?.()
      return true
    },
  })

  // A text field with content owns Escape: it clears itself first, and the
  // drawer only closes on the next press.
  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    if (isTextFieldWithValue(event.target) || !closeOnEscape || !onDismiss) {
      event.preventDefault()
      return
    }
    onDismiss()
  }

  const closeButton = (
    <StyledClose
      {...(onDismiss ? { onClick: onDismiss } : {})}
      data-hook="sidebar-close-button"
    >
      <XIcon size={16} weight="bold" />
    </StyledClose>
  )

  const closeControl = onDismiss ? (
    closeButton
  ) : (
    <RadixDialog.Close asChild>{closeButton}</RadixDialog.Close>
  )

  const titleWithNavigation =
    mode === "side" ? (
      <TitleWrapper>
        {showNavigation && (
          <NavigationButtons>
            <NavButton
              label="Go back"
              variant="ghost"
              title="Go back"
              disabled={!canGoBack}
              onClick={handleNavigateBack}
              data-hook="sidebar-back-button"
            >
              <ArrowLeftIcon size={16} weight="bold" />
            </NavButton>
            <NavButton
              label="Go forward"
              variant="ghost"
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

  const contents = (
    <>
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
                {closeControl}
              </AfterTitleContainer>
            ),
          })}
        />
      )}
      {children}
    </>
  )

  return (
    <Dialog.Root
      onOpenChange={onOpenChange}
      open={open}
      modal={mode === "modal"}
    >
      <RadixDialog.Trigger
        asChild
        {...(mode === "side" && { "aria-controls": sideContentId })}
      >
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
        {mode === "side" ? (
          <SideDrawerContent
            ref={sideContentRef}
            id={sideContentId}
            // Focusable, so a click on plain text inside the panel keeps
            // focus (and Escape) in the panel instead of moving it to body.
            tabIndex={-1}
            role="dialog"
            aria-label={typeof title === "string" ? title : "Drawer"}
            data-hook={dataHook}
            mode={mode}
            width={width}
          >
            {contents}
            <FocusOnOpen container={sideContentRef} />
          </SideDrawerContent>
        ) : (
          <DrawerContent
            aria-describedby={undefined}
            data-hook={dataHook}
            mode={mode}
            width={width}
            {...(onDismiss && {
              onEscapeKeyDown: closeOnEscape ? handleEscapeKeyDown : undefined,
              onInteractOutside: closeOnOverlayClick ? onDismiss : undefined,
            })}
          >
            {contents}
          </DrawerContent>
        )}
      </RadixDialog.Portal>
    </Dialog.Root>
  )
}

Drawer.GroupHeader = GroupHeader
Drawer.GroupItem = GroupItem
Drawer.Actions = Actions
Drawer.ContentWrapper = ContentWrapper
