type ReasoningUnsupportedHandler = (providerId: string) => void

let handler: ReasoningUnsupportedHandler | null = null

export const onReasoningUnsupported = (
  nextHandler: ReasoningUnsupportedHandler,
): (() => void) => {
  handler = nextHandler
  return () => {
    if (handler === nextHandler) handler = null
  }
}

export const reportReasoningUnsupported = (providerId: string): void => {
  handler?.(providerId)
}
