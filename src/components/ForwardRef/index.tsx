import React, { forwardRef } from "react"
import type { ReactNode, ElementType, Ref } from "react"

export const ForwardRef = forwardRef(
  <T,>(
    {
      children,
      as = "span",
      ...props
    }: T & { children: ReactNode; as?: ElementType },
    ref: Ref<HTMLDivElement>,
  ) =>
    React.createElement(
      as,
      {
        ...props,
        ref,
      },
      children,
    ),
)
ForwardRef.displayName = "ForwardRef"
