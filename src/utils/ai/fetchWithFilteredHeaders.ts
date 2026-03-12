function filterHeaders(raw: HeadersInit, allowSet: Set<string>): Headers {
  const source = new Headers(raw)
  const filtered = new Headers()
  source.forEach((value, key) => {
    if (allowSet.has(key.toLowerCase())) {
      filtered.set(key, value)
    }
  })
  return filtered
}

export function createHeaderFilteredFetch(
  allowedHeaders: string[],
): typeof globalThis.fetch {
  const allowSet = new Set(allowedHeaders.map((h) => h.toLowerCase()))
  return (input, init) => {
    // Collect headers from both the Request object and init
    const merged = new Headers()
    if (input instanceof Request) {
      input.headers.forEach((v, k) => merged.set(k, v))
    }
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => merged.set(k, v))
    }

    const filtered = filterHeaders(merged, allowSet)

    // Normalize to plain URL + init to avoid Request carrying extra headers
    const url = input instanceof Request ? input.url : input
    const method =
      init?.method ?? (input instanceof Request ? input.method : undefined)
    const body =
      init?.body ?? (input instanceof Request ? input.body : undefined)
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)

    return globalThis.fetch(url, {
      ...init,
      method,
      headers: filtered,
      body,
      signal,
    })
  }
}

export const OPENAI_ALLOWED_HEADERS = ["content-type", "authorization"]

export const ANTHROPIC_ALLOWED_HEADERS = [
  "content-type",
  "x-api-key",
  "anthropic-version",
]
