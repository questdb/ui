import { createElement, type JSX } from "react"

// A plain DOM element standing in for a shared component in a module mock.
// It drops the component's own props, which React rejects on DOM elements.
export const domStandIn =
  (tag: keyof JSX.IntrinsicElements, componentProps: readonly string[]) =>
  (props: Record<string, unknown>) =>
    createElement(
      tag,
      Object.fromEntries(
        Object.entries(props).filter(
          ([name]) => !componentProps.includes(name),
        ),
      ),
    )
