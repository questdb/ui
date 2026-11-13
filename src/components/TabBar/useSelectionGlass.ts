import React, { useEffect, useRef } from "react"
import { createLiquidLensMap } from "../LiquidGlass/createLiquidLensMap"
import { clamp } from "../../utils/clamp"
import { prefersReducedMotion } from "../../utils/prefersReducedMotion"

const LIQUID_GLASS_HEIGHT = 48
const LIQUID_GLASS_RADIUS = 10
const TRAVEL_DURATION_MS = 360

type Refs = {
  rootRef: React.RefObject<HTMLElement>
  containerRef: React.RefObject<HTMLElement>
  layerRef: React.RefObject<HTMLElement>
  glassRef: React.RefObject<HTMLElement>
  lensMapRef: React.RefObject<SVGFEImageElement>
  filterRef: React.RefObject<SVGFilterElement>
}

type SyncOptions = {
  animate: boolean
  refreshLens: boolean
  surface?: HTMLElement | null
}

let instanceCounter = 0

export const useSelectionGlass = ({
  rootRef,
  containerRef,
  layerRef,
  glassRef,
  lensMapRef,
  filterRef,
}: Refs) => {
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const filter = filterRef.current
    const glass = glassRef.current
    if (!filter || !glass) return
    const filterId = `qdb-tab-liquid-lens-${instanceCounter}`
    instanceCounter += 1
    filter.id = filterId
    const filterValue = `url("#${filterId}") blur(3px) saturate(150%)`
    glass.style.backdropFilter = filterValue
    glass.style.setProperty("-webkit-backdrop-filter", filterValue)
  }, [filterRef, glassRef])

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    },
    [],
  )

  const sync = ({ animate, refreshLens, surface }: SyncOptions) => {
    const root = rootRef.current
    const container = containerRef.current
    const layer = layerRef.current
    const glass = glassRef.current
    if (!root || !container || !layer || !glass) return

    const activeSurface =
      surface ??
      root.querySelector<HTMLElement>(".chrome-tab[active] .chrome-tab-content")
    if (!activeSurface) {
      glass.style.opacity = "0"
      return
    }

    const rootRect = root.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const surfaceRect = activeSurface.getBoundingClientRect()
    const glassRect = glass.getBoundingClientRect()
    const wasVisible = glass.style.opacity === "1" && glassRect.width > 0
    const previousX = glassRect.left - containerRect.left
    const previousWidth = glassRect.width
    const targetX = surfaceRect.left - containerRect.left
    const targetWidth = surfaceRect.width

    layer.style.left = `${containerRect.left - rootRect.left}px`
    layer.style.width = `${containerRect.width}px`
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    glass.style.width = `${targetWidth}px`
    glass.style.transform = `translate3d(${targetX}px, 0, 0)`
    glass.style.opacity = "1"

    if (refreshLens && lensMapRef.current) {
      const mapUrl = createLiquidLensMap({
        width: targetWidth,
        height: LIQUID_GLASS_HEIGHT,
        radius: LIQUID_GLASS_RADIUS,
      })
      if (mapUrl && lensMapRef.current.getAttribute("href") !== mapUrl) {
        lensMapRef.current.setAttribute("href", mapUrl)
      }
    }

    if (
      !animate ||
      !wasVisible ||
      prefersReducedMotion() ||
      Math.abs(targetX - previousX) < 1
    ) {
      return
    }

    const previousCenter = previousX + previousWidth / 2
    const targetCenter = targetX + targetWidth / 2
    const travel = targetCenter - previousCenter
    const maxStretch = Math.min(52, Math.max(12, Math.abs(travel) * 0.2))
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = clamp((now - startedAt) / TRAVEL_DURATION_MS, 0, 1)
      const eased = 1 - Math.pow(1 - progress, 3.2)
      const centre = previousCenter + travel * eased
      const baseWidth = previousWidth + (targetWidth - previousWidth) * eased
      const liquidStretch =
        Math.pow(Math.sin(Math.PI * progress), 1.35) * maxStretch
      const width = baseWidth + liquidStretch
      const x = centre - width / 2

      glass.style.width = `${width}px`
      glass.style.transform = `translate3d(${x}px, 0, 0)`

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick)
        return
      }
      glass.style.width = `${targetWidth}px`
      glass.style.transform = `translate3d(${targetX}px, 0, 0)`
      frameRef.current = null
    }

    glass.style.width = `${previousWidth}px`
    glass.style.transform = `translate3d(${previousX}px, 0, 0)`
    frameRef.current = window.requestAnimationFrame(tick)
  }

  return sync
}
