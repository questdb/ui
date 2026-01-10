export type DiscoveredModel = {
  id: string
  name: string
  owned_by?: string
}

export type ModelDiscoveryResult =
  | { success: true; models: DiscoveredModel[] }
  | { success: false; error: string }

export type ConnectionTestResult = {
  valid: boolean
  error?: string
}

/**
 * Build headers for API requests
 */
const buildHeaders = (apiKey?: string): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }
  return headers
}

/**
 * Discover available models from an OpenAI-compatible endpoint
 */
export const discoverModels = async (
  baseUrl: string,
  apiKey?: string,
): Promise<ModelDiscoveryResult> => {
  try {
    const normalizedUrl = normalizeBaseUrl(baseUrl)
    const response = await fetch(`${normalizedUrl}/models`, {
      method: "GET",
      headers: buildHeaders(apiKey),
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid API key" }
      }
      if (response.status === 404) {
        return { success: false, error: "Models endpoint not found. Check the base URL." }
      }
      return { success: false, error: `Server returned ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()
    const modelList = data.data || data.models || []

    const models: DiscoveredModel[] = modelList.map((model: any) => ({
      id: model.id || model.name,
      name: model.id || model.name,
      owned_by: model.owned_by,
    }))

    // Sort models alphabetically by id
    models.sort((a, b) => a.id.localeCompare(b.id))

    return { success: true, models }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover models"
    return { success: false, error: formatConnectionError(message) }
  }
}

/**
 * Test connection to a custom OpenAI-compatible provider
 */
export const testCustomProviderConnection = async (
  baseUrl: string,
  apiKey?: string,
): Promise<ConnectionTestResult> => {
  try {
    const normalizedUrl = normalizeBaseUrl(baseUrl)
    const response = await fetch(`${normalizedUrl}/models`, {
      method: "GET",
      headers: buildHeaders(apiKey),
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid API key" }
      }
      if (response.status === 404) {
        return { valid: false, error: "Endpoint not found. Check the base URL." }
      }
      return { valid: false, error: `Server returned ${response.status}: ${response.statusText}` }
    }

    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed"
    return { valid: false, error: formatConnectionError(message) }
  }
}

/**
 * Format connection error messages to be more user-friendly
 */
const formatConnectionError = (message: string): string => {
  if (message.includes("ECONNREFUSED") || message.toLowerCase().includes("connection refused")) {
    return "Connection refused. Is the server running?"
  }
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch failed")) {
    return "Network error. Check the URL and try again."
  }
  if (message.toLowerCase().includes("cors")) {
    return "CORS error. The server may need to allow requests from this origin."
  }
  return message
}

/**
 * Normalize base URL to ensure it ends without trailing slash
 */
const normalizeBaseUrl = (url: string): string => {
  let normalized = url.trim()
  // Remove trailing slash
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}
