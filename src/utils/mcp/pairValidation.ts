// Loopback-only WS guards against reflected CSRF via attacker-controlled
// ws:// deep links. Token floor matches the bridge's token-mint length.

export const LOCALHOST_WS_RE =
  /^ws:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+(\?.*)?$/

export const TOKEN_RE = /^[a-zA-Z0-9_-]{20,}$/
