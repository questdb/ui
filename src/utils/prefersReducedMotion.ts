// The query object is created once and reused: matchMedia allocates a live
// listener target, and animation code asks for this on every transition.
let reduceMotionQuery: MediaQueryList | null = null

export const prefersReducedMotion = () =>
  (reduceMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)"))
    .matches
