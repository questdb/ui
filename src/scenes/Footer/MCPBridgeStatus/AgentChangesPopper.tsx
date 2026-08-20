import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { usePopper } from "react-popper"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import { InfoIcon, XIcon } from "@phosphor-icons/react"
import { usePopperStyles, useTransition } from "../../../hooks"
import { OVERLAY_Z_INDEX } from "../../../components/Overlay"
import { TransitionDuration } from "../../../components/Transition"
import { IconButton, TextButton } from "../../../components"
import { floatingSurfaceStyles } from "../../../components/overlayStyles"

const Card = styled.div`
  ${floatingSurfaceStyles}
  display: flex;
  align-items: center;
  gap: 0.8rem;
  max-width: min(34rem, calc(100vw - 2rem));
  padding: 1.2rem 1.4rem;
  & > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.statusInfo};
  }
`

const Message = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow-wrap: anywhere;

  b {
    font-weight: 600;
  }
`

const ViewLink = styled(TextButton)`
  flex-shrink: 0;
`

const CloseButton = styled(IconButton).attrs({
  label: "Dismiss agent changes notification",
  variant: "ghost",
  size: "sm",
})`
  flex-shrink: 0;
  padding: 0.2rem;
`

const MODIFIERS = [{ name: "offset", options: { offset: [0, 8] } }]

type Props = {
  open: boolean
  anchorEl: HTMLElement | null
  label: string
  onView: () => void
  onDismiss: () => void
  onAutoHidePausedChange: (paused: boolean) => void
}

export const AgentChangesPopper: React.FC<Props> = ({
  open,
  anchorEl,
  label,
  onView,
  onDismiss,
  onAutoHidePausedChange,
}) => {
  const [container] = useState<HTMLElement>(() => document.createElement("div"))
  const transitionTimeoutId = useRef<number | undefined>()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const { attributes, styles, forceUpdate } = usePopper(anchorEl, container, {
    placement: "top-end",
    modifiers: [...MODIFIERS, { name: "eventListeners", enabled: open }],
  })

  usePopperStyles(container, styles.popper, OVERLAY_Z_INDEX - 1)
  useTransition(container, open, transitionTimeoutId, forceUpdate)

  // Hover and focus each pause auto-hide independently: a single shared flag let
  // a pointer-leave resume the timer while keyboard focus was still inside.
  useEffect(() => {
    onAutoHidePausedChange(hovered || focused)
  }, [hovered, focused, onAutoHidePausedChange])

  // Removing the focused control (View / close / Escape) would drop focus to the
  // document body; return it to the pill the toast points at.
  const focusAnchorPill = useCallback(() => {
    anchorEl
      ?.querySelector<HTMLElement>('[data-hook="mcp-status-pill"]')
      ?.focus()
  }, [anchorEl])

  const handleView = useCallback(() => {
    focusAnchorPill()
    onView()
  }, [focusAnchorPill, onView])

  const handleDismiss = useCallback(() => {
    focusAnchorPill()
    onDismiss()
  }, [focusAnchorPill, onDismiss])

  useEffect(
    () => () => {
      clearTimeout(transitionTimeoutId.current)
      if (document.body.contains(container)) {
        document.body.removeChild(container)
      }
    },
    [container],
  )

  useEffect(() => {
    if (!open) return
    // Only claim Escape when focus is inside the popper, so a press meant for a
    // concurrent dialog doesn't dismiss this toast.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (!container.contains(document.activeElement)) return
      handleDismiss()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, handleDismiss, container])

  return (
    <CSSTransition
      classNames="fade-reg"
      in={open}
      timeout={TransitionDuration.REG}
      unmountOnExit
    >
      <>
        {ReactDOM.createPortal(
          <Card
            {...attributes.popper}
            data-hook="agent-changes-popper"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <InfoIcon size={18} weight="duotone" aria-hidden="true" />
            <Message>
              New changes from the agent in <b>{label}</b>
            </Message>
            <ViewLink
              type="button"
              onClick={handleView}
              aria-label={`View agent changes in ${label}`}
              data-hook="agent-changes-view"
            >
              View
            </ViewLink>
            <CloseButton
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss agent changes notification"
            >
              <XIcon size={14} />
            </CloseButton>
          </Card>,
          container,
        )}
      </>
    </CSSTransition>
  )
}
