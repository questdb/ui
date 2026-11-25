import React, { useEffect, useRef } from "react"
import styled, { useTheme } from "styled-components"
import { createScene, type Flow, type Scene } from "./demo/scene"
import { sceneStyles } from "./demo/sceneStyles"
import { scenePaletteOf, sceneVarsOf } from "./demo/palette"

// Mounts the demo scene in the console's theme and keeps it to the panel's
// size. The scene is a picture of the product, so assistive tech skips it;
// the feature list beside it says what it shows.

const Root = styled.div`
  ${({ theme }) => sceneVarsOf(scenePaletteOf(theme))};
  ${sceneStyles};
  height: 100%;
  min-width: 0;
  box-sizing: border-box;

  && {
    padding-top: 4.4rem;
  }
`

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export const AgentPromoDemo = ({
  onFlow,
  sceneRef,
}: {
  onFlow: (flow: Flow) => void
  sceneRef: React.MutableRefObject<Scene | null>
}) => {
  const theme = useTheme()
  const rootRef = useRef<HTMLDivElement>(null)
  const onFlowRef = useRef(onFlow)
  onFlowRef.current = onFlow
  // A theme change redraws the scene in its colours, where it was.
  const timeRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const scene = createScene(root, {
      onFlow: (flow) => onFlowRef.current(flow),
      motion: !prefersReducedMotion(),
      palette: scenePaletteOf(theme),
      startAt: timeRef.current,
    })
    sceneRef.current = scene

    // Charts are drawn to their cells' size: redraw when the panel resizes.
    let width = root.offsetWidth
    let height = root.offsetHeight
    let pending: ReturnType<typeof setTimeout> | undefined
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (root.offsetWidth === width && root.offsetHeight === height)
              return
            width = root.offsetWidth
            height = root.offsetHeight
            clearTimeout(pending)
            pending = setTimeout(() => scene.relayout(), 150)
          })
    observer?.observe(root)

    return () => {
      clearTimeout(pending)
      observer?.disconnect()
      timeRef.current = scene.time()
      scene.destroy()
      sceneRef.current = null
    }
  }, [theme.mode])

  return <Root ref={rootRef} aria-hidden data-hook="agent-promo-demo" />
}
