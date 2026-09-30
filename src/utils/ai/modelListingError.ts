import type { AiAssistantAPIError } from "./aiAssistant"

const getHttpStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null
  }
  const status = (error as { status?: unknown }).status
  return typeof status === "number" ? status : null
}

export const getModelListingErrorMessage = (
  error: unknown,
  classified: AiAssistantAPIError,
): string => {
  const status = getHttpStatus(error)

  if (status === 401 || classified.type === "invalid_key") {
    return "Invalid API key"
  }
  if (status === 403) {
    return "This API key does not have permission to list models"
  }
  if (status === 404 || status === 405) {
    return "This provider does not support model listing. Configure its models manually."
  }
  if (status === 429 || classified.type === "rate_limit") {
    return "The provider rate limit was reached. Please try again later."
  }
  if (status !== null && status >= 500) {
    return "The provider is temporarily unavailable. Please try again later."
  }
  if (classified.type === "network") {
    return "Could not reach the provider. Check its URL and your network connection."
  }
  return classified.message
}
