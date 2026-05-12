import { useCallback, useState } from "react"

export type ResizeController = {
  /** Live drag value that should override any persisted height. Null when idle. */
  liveHeight: number | null
  /** Called per mousemove with the latest clamped height. */
  resizeLive: (height: number) => void
  /** Called on drop — clears liveHeight and writes the persisted height. */
  resizeEnd: (height: number) => void
  /** Called on double-click — clears liveHeight and removes the override. */
  resetHeight: () => void
}

export const useCellResize = (
  minHeight: number,
  commit: (height: number) => void,
  commitReset: () => void,
): ResizeController => {
  const [liveHeight, setLiveHeight] = useState<number | null>(null)

  const resizeLive = useCallback(
    (height: number) => setLiveHeight(Math.max(minHeight, height)),
    [minHeight],
  )

  const resizeEnd = useCallback(
    (height: number) => {
      setLiveHeight(null)
      commit(Math.max(minHeight, height))
    },
    [minHeight, commit],
  )

  const resetHeight = useCallback(() => {
    setLiveHeight(null)
    commitReset()
  }, [commitReset])

  return { liveHeight, resizeLive, resizeEnd, resetHeight }
}
