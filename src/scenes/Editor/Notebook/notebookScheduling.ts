const FRAME_FALLBACK_MS = 16
const IDLE_FALLBACK_MS = 200

export const scheduleFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback())
  } else {
    setTimeout(callback, FRAME_FALLBACK_MS)
  }
}

export const scheduleIdle = (callback: () => void): void => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback(), { timeout: IDLE_FALLBACK_MS })
  } else {
    setTimeout(callback, IDLE_FALLBACK_MS)
  }
}
