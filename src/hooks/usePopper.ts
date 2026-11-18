import {
  createPopper,
  type Instance,
  type Modifier,
  type Options,
  type State,
  type VirtualElement,
} from "@popperjs/core"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import isEqual from "react-fast-compare"

// Positions a popper element against a reference with Popper.js. React owns
// the styles and attributes: Popper computes them and the caller applies them.

type PopperOptions = Partial<Pick<Options, "placement" | "strategy">> & {
  modifiers?: Options["modifiers"]
}

type PopperRendering = {
  styles: Record<string, React.CSSProperties>
  attributes: Record<string, Record<string, string | boolean> | undefined>
}

const NO_MODIFIERS: Options["modifiers"] = []

const renderingOf = (state: State): PopperRendering => {
  const elements = Object.keys(state.elements)
  return {
    styles: Object.fromEntries(
      elements.map((element) => [
        element,
        (state.styles[element] ?? {}) as React.CSSProperties,
      ]),
    ),
    attributes: Object.fromEntries(
      elements.map((element) => [element, state.attributes[element]]),
    ),
  }
}

export const usePopper = (
  referenceElement: Element | VirtualElement | null | undefined,
  popperElement: HTMLElement | null | undefined,
  {
    placement = "bottom",
    strategy = "absolute",
    modifiers = NO_MODIFIERS,
  }: PopperOptions = {},
) => {
  const [rendering, setRendering] = useState<PopperRendering>({
    styles: { popper: { position: strategy, left: "0", top: "0" } },
    attributes: {},
  })
  const instanceRef = useRef<Instance | null>(null)
  const previousOptionsRef = useRef<Partial<Options> | null>(null)

  const renderStateModifier = useMemo<Partial<Modifier<"renderState", object>>>(
    () => ({
      name: "renderState",
      enabled: true,
      phase: "write",
      fn: ({ state }) => setRendering(renderingOf(state)),
      requires: ["computeStyles"],
    }),
    [],
  )

  // Callers pass inline modifier arrays; an unchanged configuration must keep
  // its identity, or every render would reconfigure Popper and render again.
  const options = useMemo<Partial<Options>>(() => {
    const next: Partial<Options> = {
      placement,
      strategy,
      modifiers: [
        ...modifiers,
        renderStateModifier,
        { name: "applyStyles", enabled: false },
      ],
    }
    if (isEqual(previousOptionsRef.current, next)) {
      return previousOptionsRef.current ?? next
    }
    previousOptionsRef.current = next
    return next
  }, [placement, strategy, modifiers, renderStateModifier])

  useLayoutEffect(() => {
    void instanceRef.current?.setOptions(options)
  }, [options])

  useLayoutEffect(() => {
    if (!referenceElement || !popperElement) return
    const instance = createPopper(referenceElement, popperElement, options)
    instanceRef.current = instance
    return () => {
      instance.destroy()
      instanceRef.current = null
    }
    // Options reach a live instance through setOptions above.
  }, [referenceElement, popperElement])

  return {
    styles: rendering.styles,
    attributes: rendering.attributes,
    update: instanceRef.current?.update ?? null,
    forceUpdate: instanceRef.current?.forceUpdate ?? null,
  }
}
