// A legacy grid is reused across query results. Deferred rendering, page-load
// timers and pagination callbacks must all belong to the current result.
export const createGridResultLifecycle = () => {
  let generation = 0
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  let pageTimer: ReturnType<typeof setTimeout> | undefined

  const guard = <T extends unknown[]>(callback: (...args: T) => void) => {
    const requestedGeneration = generation
    return (...args: T) => {
      if (requestedGeneration === generation) callback(...args)
    }
  }

  return {
    guard,
    replaceResult: (render: () => void) => {
      generation++
      clearTimeout(pageTimer)
      clearTimeout(renderTimer)
      renderTimer = setTimeout(guard(render), 0)
    },
    schedulePageLoad: (load: () => void) => {
      clearTimeout(pageTimer)
      pageTimer = setTimeout(guard(load), 75)
    },
  }
}
