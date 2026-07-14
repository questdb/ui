import React, { useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { usePopper } from "react-popper"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import { InfoIcon, XIcon } from "@phosphor-icons/react"
import { usePopperStyles, useTransition } from "../../../hooks"
import { OVERLAY_Z_INDEX } from "../../../components/Overlay"
import { TransitionDuration } from "../../../components/Transition"

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  max-width: min(34rem, calc(100vw - 2rem));
  padding: 1.2rem 1.4rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.8rem;
  box-shadow: 0 12px 32px -8px ${({ theme }) => theme.color.black};

  & > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.cyan};
  }
`

const Message = styled.span`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.foreground};

  b {
    font-weight: 600;
  }
`

const ViewLink = styled.button`
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0.2rem 0.4rem;
  color: ${({ theme }) => theme.color.cyan};
  font: inherit;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.cyan};
    outline-offset: 2px;
  }
`

const CloseButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0.2rem;
  color: ${({ theme }) => theme.color.gray2};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.cyan};
    outline-offset: 2px;
  }
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
  const { attributes, styles, forceUpdate } = usePopper(anchorEl, container, {
    placement: "top-end",
    modifiers: [...MODIFIERS, { name: "eventListeners", enabled: open }],
  })

  usePopperStyles(container, styles.popper, OVERLAY_Z_INDEX - 1)
  useTransition(container, open, transitionTimeoutId, forceUpdate)

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
      onDismiss()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onDismiss, container])

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
            role="status"
            aria-atomic="true"
            data-hook="agent-changes-popper"
            onPointerEnter={() => onAutoHidePausedChange(true)}
            onPointerLeave={() => onAutoHidePausedChange(false)}
            onFocus={() => onAutoHidePausedChange(true)}
            onBlur={() => onAutoHidePausedChange(false)}
          >
            <InfoIcon size={18} weight="duotone" />
            <Message>
              New changes from the agent in <b>{label}</b>
            </Message>
            <ViewLink
              type="button"
              onClick={onView}
              aria-label={`View agent changes in ${label}`}
              data-hook="agent-changes-view"
            >
              View
            </ViewLink>
            <CloseButton
              type="button"
              onClick={onDismiss}
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
