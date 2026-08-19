import React, {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import styled, { css } from "styled-components"

import { ButtonBase } from "../Button"
import { createLiquidLensMap } from "../LiquidGlass/createLiquidLensMap"

export type SegmentedControlTone = "neutral" | "success" | "info"

export type SegmentedControlActiveTone = "accent" | "neutral"

export type SegmentedControlSize = "xs" | "sm" | "md"

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const SegmentedControlRoot = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem;
  border: 1px solid ${({ theme }) => theme.color.borderStrong};
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.controlTrack};
  isolation: isolate;
  overflow: hidden;

  > button {
    position: relative;
    z-index: 1;
  }

  && > button[aria-pressed="true"] {
    z-index: 3;
    background: transparent;
    box-shadow: none;
  }

  &&
    > button[aria-pressed="true"]:hover:not(:disabled):not(
      [aria-disabled="true"]
    ) {
    background: transparent;
  }

  /* The liquid track clips content at its rounded edge, so the standard
     outside button outline is not visible here. Draw the keyboard ring inside
     every direct action instead, including auxiliary actions such as
     maximize/reset that live beside the segments. */
  && > button:focus-visible,
  && > button[aria-pressed="true"]:focus-visible {
    outline: none;
    outline-offset: 0;
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.color.contentAccent};
  }
`

const FilterDefinitions = styled.svg`
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
`

const GlassSelection = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  background: ${({ theme }) => theme.color.glassSurface};
  border: 1px solid ${({ theme }) => theme.color.glassBorder};
  border-bottom-width: 2px;
  border-bottom-color: ${({ theme }) => theme.color.glassEdge};
  border-radius: 0.4rem;
  box-shadow: 0 3px 9px ${({ theme }) => theme.color.shadowSoft};
  backdrop-filter: blur(6px) saturate(145%);
  -webkit-backdrop-filter: blur(5px) saturate(150%);
  transition: opacity 100ms ease;
  will-change: transform, width;
`

let segmentedControlInstance = 0

let reduceMotionQuery: MediaQueryList | null = null
const prefersReducedMotion = () =>
  (reduceMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)"))
    .matches

type SegmentedControlProps = React.HTMLAttributes<HTMLDivElement>

export const SegmentedControl = forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>(({ children, ...props }, forwardedRef) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const glassRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<SVGFEImageElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const activeButtonRef = useRef<HTMLElement | null>(null)
  const filterIdRef = useRef<string | null>(null)

  if (filterIdRef.current === null) {
    filterIdRef.current = `qdb-segmented-liquid-lens-${segmentedControlInstance}`
    segmentedControlInstance += 1
  }

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef],
  )

  const updateSelection = useCallback((animate: boolean, force = false) => {
    const root = rootRef.current
    const glass = glassRef.current
    if (!root || !glass) return

    const activeButton = root.querySelector<HTMLElement>(
      'button[aria-pressed="true"]',
    )
    if (!activeButton) {
      activeButtonRef.current = null
      glass.style.opacity = "0"
      return
    }
    const activeButtonChanged = activeButtonRef.current !== activeButton

    // A layout-mode change triggers several notebook renders and a resize
    // notification immediately after the selector starts moving. None of
    // those same-selection updates should snap the in-flight transition to
    // its destination; the captured local button geometry remains valid.
    // Outside a transition, a same-selection render has nothing to apply
    // either — geometry changes arrive through the resize observer, which
    // forces the recompute — so bail before forcing a layout pass.
    if (!activeButtonChanged) {
      if (animationFrameRef.current !== null) return
      if (!force && glass.style.opacity === "1") return
    }
    activeButtonRef.current = activeButton

    const rootRect = root.getBoundingClientRect()
    const buttonRect = activeButton.getBoundingClientRect()
    const glassRect = glass.getBoundingClientRect()
    const contentOriginX = rootRect.left + root.clientLeft
    const contentOriginY = rootRect.top + root.clientTop
    const wasVisible = glass.style.opacity === "1" && glassRect.width > 0
    const previousX = glassRect.left - contentOriginX
    const previousWidth = glassRect.width
    const targetX = buttonRect.left - contentOriginX
    const targetWidth = buttonRect.width
    const targetY = buttonRect.top - contentOriginY
    const targetHeight = buttonRect.height

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    glass.style.top = `${targetY}px`
    glass.style.height = `${targetHeight}px`
    glass.style.width = `${targetWidth}px`
    glass.style.transform = `translate3d(${targetX}px, 0, 0)`
    glass.style.opacity = "1"

    const mapUrl = createLiquidLensMap({
      width: targetWidth,
      height: targetHeight,
      radius: 4,
      verticalStrength: 0.12,
    })
    if (
      mapRef.current &&
      mapUrl &&
      mapRef.current.getAttribute("href") !== mapUrl
    ) {
      mapRef.current.setAttribute("href", mapUrl)
    }

    const reduceMotion = prefersReducedMotion()
    if (
      !animate ||
      !activeButtonChanged ||
      !wasVisible ||
      reduceMotion ||
      Math.abs(targetX - previousX) < 1
    ) {
      return
    }

    const previousCenter = previousX + previousWidth / 2
    const targetCenter = targetX + targetWidth / 2
    const travel = targetCenter - previousCenter
    const maxStretch = Math.min(16, Math.max(6, Math.abs(travel) * 0.16))
    const duration = 260
    let startedAt: number | null = null

    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const progress = clamp((now - startedAt) / duration, 0, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const center = previousCenter + travel * eased
      const baseWidth = previousWidth + (targetWidth - previousWidth) * eased
      const stretch = Math.sin(Math.PI * progress) * maxStretch
      const width = baseWidth + stretch
      const x = center - width / 2

      glass.style.width = `${width}px`
      glass.style.transform = `translate3d(${x}px, 0, 0)`

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      glass.style.width = `${targetWidth}px`
      glass.style.transform = `translate3d(${targetX}px, 0, 0)`
      animationFrameRef.current = null
    }

    glass.style.width = `${previousWidth}px`
    glass.style.transform = `translate3d(${previousX}px, 0, 0)`
    animationFrameRef.current = window.requestAnimationFrame(tick)
  }, [])

  useLayoutEffect(() => {
    updateSelection(true)
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const resizeObserver = new ResizeObserver(() =>
      updateSelection(false, true),
    )
    resizeObserver.observe(root)

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [updateSelection])

  const filterId = filterIdRef.current

  return (
    <SegmentedControlRoot ref={setRootRef} {...props}>
      <FilterDefinitions aria-hidden="true" focusable="false">
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              ref={mapRef}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="liquid-map"
            />
            <feGaussianBlur
              in="liquid-map"
              stdDeviation="0.25"
              result="soft-liquid-map"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="soft-liquid-map"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </FilterDefinitions>
      <GlassSelection
        ref={glassRef}
        aria-hidden="true"
        style={{
          backdropFilter: `url("#${filterId}") blur(2px) saturate(150%)`,
        }}
      />
      {children}
    </SegmentedControlRoot>
  )
})

SegmentedControl.displayName = "SegmentedControl"

type SegmentedControlButtonProps = {
  $active?: boolean
  $tone?: SegmentedControlTone
  $activeTone?: SegmentedControlActiveTone
  $size?: SegmentedControlSize
}

export const SegmentedControlButton = styled(
  ButtonBase,
).attrs<SegmentedControlButtonProps>(({ $active }) => ({
  "aria-pressed": $active,
}))<SegmentedControlButtonProps>`
  && {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    width: auto;
    min-width: ${({ $size = "sm" }) => ($size === "xs" ? "2rem" : "auto")};
    height: ${({ $size = "sm" }) => {
      if ($size === "xs") return "2rem"
      if ($size === "md") return "3rem"
      return "2.8rem"
    }};
    min-height: ${({ $size = "sm" }) => {
      if ($size === "xs") return "2rem"
      if ($size === "md") return "3rem"
      return "2.8rem"
    }};
    padding: ${({ $size = "sm" }) =>
      $size === "xs" ? "0" : $size === "md" ? "0 0.9rem" : "0 0.8rem"};
    border: 0;
    border-radius: ${({ $size = "sm" }) =>
      $size === "xs" ? "0.3rem" : "0.4rem"};
    background: transparent;
    color: ${({ $tone = "neutral", theme }) => {
      if ($tone === "success") return theme.color.statusSuccess
      if ($tone === "info") return theme.color.statusInfo
      return theme.color.contentSecondary
    }};
    font-size: ${({ $size = "sm", theme }) => {
      if ($size === "xs") return theme.fontSize.xs
      if ($size === "md") return theme.fontSize.md
      return theme.fontSize.sm
    }};
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  &&:disabled,
  &&[aria-disabled="true"] {
    opacity: 0.5;
  }

  &&:hover:not(:disabled):not([aria-disabled="true"]) {
    background: ${({ theme }) => theme.color.interactionHover};
    color: ${({ $tone = "neutral", theme }) => {
      if ($tone === "success") return theme.color.statusSuccess
      if ($tone === "info") return theme.color.statusInfo
      return theme.color.contentSecondary
    }};
  }

  ${({ $active, $activeTone = "accent", theme }) => {
    if (!$active) return undefined

    if ($activeTone === "neutral") {
      return css`
        &&,
        &&:hover:not(:disabled):not([aria-disabled="true"]) {
          background: ${theme.color.interactionNeutral};
          color: ${theme.color.contentSecondary};
        }
      `
    }

    return css`
      && {
        background: ${theme.color.interactionAccentActive};
        color: ${theme.color.contentAccent};
      }

      &&:hover:not(:disabled):not([aria-disabled="true"]) {
        background: ${theme.color.interactionAccentActive};
        color: ${theme.color.contentAccent};
      }
    `
  }}
`
