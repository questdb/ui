import React, { useEffect, useRef } from "react"
import styled, { keyframes } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Button } from "../../../../components"
import { CellOverlayPortal } from "./CellOverlayContext"

export type SettingsPresentation = "drawer" | "panel"

export type SettingsDismissMethod = "backdrop" | "close" | "button" | "escape"

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: auto;
  background: ${({ theme }) => theme.color.shadowMedium};
  animation: ${fadeIn} 0.2s ease both;
`

const DRAWER_WIDTH = "36rem"

const Panel = styled.div<{
  $presentation: SettingsPresentation
  $drawerWidth: string
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
  pointer-events: auto;
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
  animation-name: ${({ $presentation }) =>
    $presentation === "drawer" ? slideIn : "none"};
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

type Props = {
  presentation: SettingsPresentation
  open: boolean
  title: string
  dataHookBase: string
  onDismiss: (method: SettingsDismissMethod) => void
  onReset: () => void
  onCommit: () => void
  footerStart?: React.ReactNode
  drawerWidth?: string
  children: React.ReactNode
}

export const SettingsDrawerShell: React.FC<Props> = ({
  presentation,
  open,
  title,
  dataHookBase,
  onDismiss,
  onReset,
  onCommit,
  footerStart,
  drawerWidth = DRAWER_WIDTH,
  children,
}) => {
  const popperOpenAtPointerDownRef = useRef(false)
  const isDrawer = presentation === "drawer"
  const visible = !isDrawer || open

  // A dropdown in the drawer is non-modal, so the click that closes it also
  // reaches the backdrop. Radix unmounts the popper during pointerdown, so
  // whether one was open has to be read before that click arrives.
  const handleBackdropPointerDown = () => {
    popperOpenAtPointerDownRef.current = isRadixPopperOpen()
  }

  const handleBackdropClick = () => {
    if (popperOpenAtPointerDownRef.current) return
    onDismiss("backdrop")
  }

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
          onPointerDown={handleBackdropPointerDown}
          onClick={handleBackdropClick}
          aria-hidden
        />
      )}
      <Panel
        $presentation={presentation}
        $drawerWidth={drawerWidth}
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => (isDrawer ? onDismiss("button") : onReset())}
          >
            {isDrawer ? "Cancel" : "Reset changes"}
          </Button>
          <Button type="button" variant="primary" onClick={onCommit}>
            {isDrawer ? "Save" : "Apply"}
          </Button>
        </Footer>
      </Panel>
    </>
  )

  return isDrawer ? <CellOverlayPortal>{content}</CellOverlayPortal> : content
}
