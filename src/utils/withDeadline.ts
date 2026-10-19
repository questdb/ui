export class DeadlineExceededError extends Error {
  constructor() {
    super("Request timed out")
    this.name = "DeadlineExceededError"
  }
}

// Bounds both fetching and reading a body, even when the body reader ignores
// cancellation. The caller decides whether timing out also aborts the request.
export const withDeadline = async <T>(
  request: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      onTimeout()
      reject(new DeadlineExceededError())
    }, timeoutMs)
  })
  try {
    return await Promise.race([request, deadline])
  } finally {
    clearTimeout(timeout)
  }
}
