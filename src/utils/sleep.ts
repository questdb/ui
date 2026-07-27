export const sleep = (ms: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(true)
      return
    }
    const onAbort = () => {
      clearTimeout(timeoutId)
      resolve(true)
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve(false)
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
