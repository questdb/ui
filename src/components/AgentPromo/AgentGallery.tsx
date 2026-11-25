import React, { useEffect, useRef, useState } from "react"
import styled, { css } from "styled-components"
import { ButtonBase } from "../Button"
import { color } from "../../utils"
import { CHAT_AGENTS } from "../../utils/localAgent/chatAgents"
import { AgentLogo, PROMO_AGENT_IDS, type PromoAgentId } from "./AgentLogos"

// The agents the promo works with, as overlapping badges across the panel.
// The one shown (hovered, kept, or the gallery's turn) wears the active
// colour of the feature list and names itself in "Works with …".
//
// - Hover: the row splits into one rectangle per agent at the midpoints
//   between badges, so overlaps and the lifted badge do not flicker. A
//   neighbour takes HYSTERESIS px past the border; leaving waits LEAVE_MS.
// - Click keeps an agent; clicking it again lets go.
// - Gallery: while nobody points at the row and none is kept, the agents take
//   turns every GALLERY_MS. Not with reduced motion, and not while `paused`:
//   the caller pauses it while the user is at the command it names, so what
//   they copy is what they read.

const HYSTERESIS = 8
const LEAVE_MS = 140
const GALLERY_MS = 2000
const GALLERY_START_MS = 1200
const DEFAULT_WHO = "Claude Code, Codex and more"

export const agentLabelOf = (id: PromoAgentId): string =>
  CHAT_AGENTS.find((agent) => agent.id === id)?.label ?? id

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const Who = styled.div`
  font-size: 1.15rem;
  color: ${color("contentMuted")};
`

const WhoName = styled.span<{ $on: boolean }>`
  font-weight: 500;
  color: ${({ $on, theme }) =>
    $on ? theme.color.contentPrimary : theme.color.contentSecondary};
  transition: color 0.15s;
`

const Row = styled.div`
  display: flex;
  padding-top: 0.8rem;
  margin-top: -0.8rem;
  cursor: pointer;
`

const lifted = css`
  transform: translateY(-0.4rem);
  z-index: 10;
`

const Badge = styled(ButtonBase)<{
  $shown: boolean
  $ring: boolean
  $depth: number
}>`
  && {
    position: relative;
    z-index: ${({ $depth }) => $depth};
    flex: 1 1 0;
    min-width: 0;
    height: auto;
    aspect-ratio: 1;
    margin-left: -0.7rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    color: ${color("contentSecondary")};
    background: ${color("controlSurface")};
    box-shadow:
      0 0 0 0.25rem ${color("surfaceOverlay")},
      inset 0 0 0 1px ${color("borderSubtle")};
    transition:
      transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1),
      background 0.25s ease,
      color 0.25s ease;
    animation: agentBadgeIn 0.35s ease backwards;
  }

  &&:first-child {
    margin-left: 0;
  }

  &&:focus-visible {
    outline: 1px solid ${color("statusInfo")};
    outline-offset: 3px;
  }

  svg {
    width: 38%;
    height: 38%;
  }

  ${({ $shown, theme }) =>
    $shown &&
    css`
      && {
        ${lifted};
        color: ${theme.color.contentPrimary};
        background: ${theme.color.controlSurfaceHover};
      }
    `}

  ${({ $ring, theme }) =>
    $ring &&
    css`
      && {
        background:
          linear-gradient(
            ${theme.color.interactionAccentActive},
            ${theme.color.interactionAccentActive}
          ),
          ${theme.color.controlSurface};
        box-shadow:
          0 0 0 0.25rem ${theme.color.surfaceOverlay},
          inset 0 0 0 1.5px ${theme.color.borderAccentStrong};
      }
    `}

  @keyframes agentBadgeIn {
    from {
      opacity: 0;
      transform: translateX(-0.6rem);
    }
  }
`

type Props = {
  // The agent shown, or null for none: the caller puts it in the command.
  onShow: (id: PromoAgentId | null) => void
  // Holds the gallery on the agent it shows.
  paused?: boolean
  // A click kept an agent (or let it go).
  onKeep?: (id: PromoAgentId | null) => void
}

export const AgentGallery = ({ onShow, onKeep, paused = false }: Props) => {
  const rowRef = useRef<HTMLDivElement>(null)
  const badgeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [hovered, setHovered] = useState<number>(-1)
  const [kept, setKept] = useState<number>(-1)
  const [turn, setTurn] = useState<number>(-1)
  const [galleryOn, setGalleryOn] = useState(false)
  const hoveredRef = useRef(-1)
  const keptRef = useRef(-1)
  const onKeepRef = useRef(onKeep)
  hoveredRef.current = hovered
  keptRef.current = kept
  onKeepRef.current = onKeep

  const shown = hovered >= 0 ? hovered : kept >= 0 ? kept : turn
  const shownId = shown >= 0 ? PROMO_AGENT_IDS[shown] : null

  useEffect(() => {
    onShow(shownId)
  }, [shownId])

  // The gallery starts once the badges are in, and runs while nobody points
  // at the row and none is kept.
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const start = setTimeout(() => {
      // Not over a command the user is reading: it would change under them.
      if (pausedRef.current) return
      if (hoveredRef.current < 0 && keptRef.current < 0) {
        setTurn(0)
        setGalleryOn(true)
      }
    }, GALLERY_START_MS)
    return () => clearTimeout(start)
  }, [])
  useEffect(() => {
    if (!galleryOn || paused || hovered >= 0 || kept >= 0) return
    const id = setInterval(
      () => setTurn((t) => (t + 1) % PROMO_AGENT_IDS.length),
      GALLERY_MS,
    )
    return () => clearInterval(id)
  }, [galleryOn, paused, hovered, kept])

  const keep = (index: number) => {
    const next = keptRef.current === index ? -1 : index
    setKept(next)
    // Let go of a kept agent: the gallery takes turns again.
    if (next < 0) {
      setTurn(index)
      setGalleryOn(true)
    }
    onKeepRef.current?.(next >= 0 ? PROMO_AGENT_IDS[next] : null)
  }

  // Pointer: rectangles at the midpoints between badges, with hysteresis.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    let leaving: ReturnType<typeof setTimeout> | undefined
    const borders = () => {
      const badges = badgeRefs.current
      return badges.slice(1).map((b, i) => {
        const a = badges[i]
        if (!a || !b) return 0
        return (
          (a.offsetLeft +
            a.offsetWidth / 2 +
            b.offsetLeft +
            b.offsetWidth / 2) /
          2
        )
      })
    }
    const slotAt = (x: number) => {
      const bs = borders()
      const found = bs.findIndex((b) => x < b)
      const k = found < 0 ? PROMO_AGENT_IDS.length - 1 : found
      const current = hoveredRef.current
      if (current < 0 || k === current) return k
      const edge = k > current ? bs[current] : bs[current - 1]
      return Math.abs(x - edge) < HYSTERESIS ? current : k
    }
    const onMove = (event: PointerEvent) => {
      clearTimeout(leaving)
      const rect = row.getBoundingClientRect()
      const scale = rect.width / row.offsetWidth || 1
      setHovered(slotAt((event.clientX - rect.left) / scale + row.offsetLeft))
    }
    const onLeave = () => {
      clearTimeout(leaving)
      leaving = setTimeout(() => setHovered(-1), LEAVE_MS)
    }
    const onClick = () => {
      if (hoveredRef.current >= 0) keep(hoveredRef.current)
    }
    row.addEventListener("pointermove", onMove)
    row.addEventListener("pointerleave", onLeave)
    row.addEventListener("click", onClick)
    return () => {
      clearTimeout(leaving)
      row.removeEventListener("pointermove", onMove)
      row.removeEventListener("pointerleave", onLeave)
      row.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <Root>
      <Who>
        Works with{" "}
        <WhoName $on={shown >= 0} data-hook="agent-promo-works-with">
          {shownId ? agentLabelOf(shownId) : DEFAULT_WHO}
        </WhoName>
      </Who>
      <Row ref={rowRef} data-hook="agent-promo-agents">
        {PROMO_AGENT_IDS.map((id, i) => (
          <Badge
            key={id}
            ref={(node: HTMLButtonElement | null) => {
              badgeRefs.current[i] = node
            }}
            type="button"
            aria-label={agentLabelOf(id)}
            aria-pressed={kept === i}
            data-hook={`agent-promo-agent-${id}`}
            $shown={shown === i}
            $ring={kept === i || (hovered < 0 && kept < 0 && turn === i)}
            $depth={PROMO_AGENT_IDS.length - i}
            style={{ animationDelay: `${i * 50}ms` }}
            // The mouse is handled by the row; this is the keyboard's way in.
            onClick={(event: React.MouseEvent) => {
              if (event.detail === 0) keep(i)
            }}
          >
            <AgentLogo id={id} active={shown === i} />
          </Badge>
        ))}
      </Row>
    </Root>
  )
}
