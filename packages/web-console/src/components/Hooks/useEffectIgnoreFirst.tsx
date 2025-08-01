import React, { useEffect, useRef } from 'react'

export const useEffectIgnoreFirst = (effect: () => void, deps: React.DependencyList) => {
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    effect()
  }, deps)
}