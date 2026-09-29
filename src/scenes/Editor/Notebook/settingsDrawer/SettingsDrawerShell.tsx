import React, { useEffect, useRef, useState } from "react"
import styled, { keyframes } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Button, Spinner } from "../../../../components"
import { prefersReducedMotion } from "../../../../utils/prefersReducedMotion"
import { CellOverlayPortal } from "./CellOverlayContext"

export type SettingsPresentation = "drawer" | "panel"

export type SettingsDismissMethod = "backdrop" | "close" | "button" | "escape"

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`

const slideOut = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
`

const Backdrop = styled.div<{ $exiting: boolean; $still: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: ${({ $exiting }) => ($exiting ? "none" : "auto")};
  background: ${({ theme }) => theme.color.shadowMedium};
  animation-name: ${({ $exiting, $still }) =>
    $exiting ? fadeOut : $still ? "none" : fadeIn};
  animation-duration: 0.2s;
  animation-timing-function: ease;
  animation-fill-mode: both;
`

const DRAWER_WIDTH = "36rem"

const Panel = styled.div<{
  $presentation: SettingsPresentation
  $drawerWidth: string
  $exiting: boolean
  $still: boolean
}>`
  position: ${({ $presentation }) =>
    $presentation === "drawer" ? "absolute" : "relative"};
  top: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  right: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  bottom: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  width: ${({ $presentation, $drawerWidth }) =>
    $presentation === "drawer"
      ? `min(${$drawerWidth}, 90%)`
      : "clamp(26rem, 30%, 34rem)"};
  flex: ${({ $presentation }) =>
    $presentation === "drawer" ? "0 0 auto" : "0 0 clamp(26rem, 30%, 34rem)"};
  min-width: 0;
  min-height: 0;
  pointer-events: ${({ $exiting }) => ($exiting ? "none" : "auto")};
  z-index: ${({ $presentation }) => ($presentation === "drawer" ? "4" : "1")};
  background: ${({ theme, $presentation }) =>
    $presentation === "drawer"
      ? theme.color.surfaceInset
      : theme.color.surfaceRaised};
  border-left: ${({ theme, $presentation }) =>
    $presentation === "drawer"
      ? `1px solid ${theme.color.interactionNeutral}`
      : "none"};
  border-right: ${({ theme, $presentation }) =>
    $presentation === "panel"
      ? `1px solid ${theme.color.borderSubtle}`
      : "none"};
  display: flex;
  flex-direction: column;
  animation-name: ${({ $presentation, $exiting, $still }) =>
    $presentation !== "drawer" || $still
      ? "none"
      : $exiting
        ? slideOut
        : slideIn};
  animation-duration: ${({ $presentation }) =>
    $presentation === "drawer" ? "0.25s" : "0s"};
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-fill-mode: both;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const Title = styled.h3`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Body = styled.form`
  flex: 1;
  overflow-y: auto;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
`

const Footer = styled.div`
  padding: 1rem 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
`

const FooterStart = styled.div`
  margin-right: auto;
`

const isRadixPopperOpen = () =>
  document.querySelector("[data-radix-popper-content-wrapper]") !== null

type SharedProps = {
  open: boolean
  title: string
  dataHookBase: string
  onDismiss: (method: SettingsDismissMethod) => void
  onCommit: () => void
  // True while a commit waits on something async; the commit button shows
  // it and takes no second click. Dismissing stays possible.
  committing?: boolean
  footerStart?: React.ReactNode
  // Shown next to the action buttons, e.g. a validation summary.
  footerNote?: React.ReactNode
  drawerWidth?: string
  // Drawer only: true when the owner remounted mid-session (maximize,
  // restore), so the drawer appears in place instead of sliding in again.
  appearInPlace?: boolean
  children: React.ReactNode
}

// A panel's secondary action resets the draft in place; a drawer's cancels.
type PresentationProps =
  | { presentation: "drawer" }
  | { presentation: "panel"; onReset: () => void }

type Props = SharedProps & PresentationProps

export const SettingsDrawerShell: React.FC<Props> = (props) => {
  const {
    presentation,
    open,
    title,
    dataHookBase,
    onDismiss,
    onCommit,
    committing = false,
    footerStart,
    footerNote,
    drawerWidth = DRAWER_WIDTH,
    appearInPlace = false,
    children,
  } = props
  const popperOpenAtPointerDownRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [exiting, setExiting] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const [still, setStill] = useState(open && appearInPlace)
  const isDrawer = props.presentation === "drawer"
  const secondaryAction = isDrawer ? () => onDismiss("button") : props.onReset
  // A closing drawer stays mounted until its slide-out ends. Reduced motion
  // drops it at once, as before.
  if (open !== wasOpen) {
    setWasOpen(open)
    setExiting(!open && isDrawer && !prefersReducedMotion())
    setStill(false)
  }
  const visible = !isDrawer || open || exiting

  // A dropdown in the drawer is non-modal, so the click that closes it also
  // reaches the backdrop. Radix unmounts the popper during pointerdown, so
  // whether one was open has to be read before that click arrives.
  const handleBackdropPointerDown = () => {
    popperOpenAtPointerDownRef.current = isRadixPopperOpen()
  }

  const handleBackdropClick = () => {
    if (!open || popperOpenAtPointerDownRef.current) return
    onDismiss("backdrop")
  }

  const handlePanelAnimationEnd = (e: React.AnimationEvent) => {
    if (exiting && e.target === e.currentTarget) setExiting(false)
  }

  // A sliding-out drawer takes no clicks (see Panel) and no keys: a focused
  // input would still submit on Enter, and a focused button still activate.
  useEffect(() => {
    if (!exiting) return
    const focused = document.activeElement
    if (focused instanceof HTMLElement && panelRef.current?.contains(focused)) {
      focused.blur()
    }
  }, [exiting])

  useEffect(() => {
    if (!open || !isDrawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (isRadixPopperOpen()) return
      onDismiss("escape")
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [open, isDrawer, onDismiss])

  if (!visible) return null

  const content = (
    <>
      {isDrawer && (
        <Backdrop
          $exiting={exiting}
          $still={still}
          onPointerDown={handleBackdropPointerDown}
          onClick={handleBackdropClick}
          aria-hidden
        />
      )}
      <Panel
        ref={panelRef}
        $presentation={presentation}
        $drawerWidth={drawerWidth}
        $exiting={exiting}
        $still={still}
        onAnimationEnd={handlePanelAnimationEnd}
        role={isDrawer ? "dialog" : "region"}
        aria-label={title}
        data-hook={`${dataHookBase}-${presentation}`}
      >
        <Header>
          <Title>{title}</Title>
          {isDrawer && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => onDismiss("close")}
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <XIcon size={18} />
            </Button>
          )}
        </Header>

        <Body
          onSubmit={(e) => {
            e.preventDefault()
            onCommit()
          }}
        >
          {children}
        </Body>

        <Footer>
          {footerStart && <FooterStart>{footerStart}</FooterStart>}
          {footerNote}
          <Button type="button" variant="secondary" onClick={secondaryAction}>
            {isDrawer ? "Cancel" : "Reset changes"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onCommit}
            disabled={committing}
            aria-busy={committing}
            prefixIcon={committing ? <Spinner size={16} /> : undefined}
          >
            {isDrawer ? "Save" : "Apply"}
          </Button>
        </Footer>
      </Panel>
    </>
  )

  return isDrawer ? <CellOverlayPortal>{content}</CellOverlayPortal> : content
}
