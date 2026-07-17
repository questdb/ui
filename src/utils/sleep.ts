export const sleep = (ms: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(true)
      return
    }
    const timeoutId = setTimeout(() => resolve(false), ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutId)
      resolve(true)
    })
  })
