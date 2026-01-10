import OpenAI from "openai"

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
 * Discover available models from an OpenAI-compatible endpoint
 */
export const discoverModels = async (
  baseUrl: string,
  apiKey?: string,
): Promise<ModelDiscoveryResult> => {
  try {
    const client = new OpenAI({
      baseURL: normalizeBaseUrl(baseUrl),
      apiKey: apiKey || "not-required",
      dangerouslyAllowBrowser: true,
    })

    const response = await client.models.list()
    const models: DiscoveredModel[] = []

    for await (const model of response) {
      models.push({
        id: model.id,
        name: model.id,
        owned_by: model.owned_by,
      })
    }

    // Sort models alphabetically by id
    models.sort((a, b) => a.id.localeCompare(b.id))

    return { success: true, models }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover models"
    return { success: false, error: message }
  }
}

/**
 * Test connection to a custom OpenAI-compatible provider
 */
export const testCustomProviderConnection = async (
  baseUrl: string,
  apiKey?: string,
  modelId?: string,
): Promise<ConnectionTestResult> => {
  try {
    const client = new OpenAI({
      baseURL: normalizeBaseUrl(baseUrl),
      apiKey: apiKey || "not-required",
      dangerouslyAllowBrowser: true,
    })

    if (modelId) {
      // If a model is specified, try a simple completion
      await client.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      })
    } else {
      // Otherwise just list models to verify connection
      const response = await client.models.list()
      // Consume at least one item to verify the connection works
      for await (const _ of response) {
        break
      }
    }

    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed"

    // Check for common error types
    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      return { valid: false, error: "Invalid API key" }
    }
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return { valid: false, error: "Endpoint not found. Check the base URL." }
    }
    if (message.includes("ECONNREFUSED") || message.toLowerCase().includes("connection refused")) {
      return { valid: false, error: "Connection refused. Is the server running?" }
    }
    if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch")) {
      return { valid: false, error: "Network error. Check the URL and try again." }
    }

    return { valid: false, error: message }
  }
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
