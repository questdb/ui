// Loopback-only WS guards against reflected CSRF via attacker-controlled
// ws:// deep links. Token floor matches the bridge's token-mint length.

export const LOCALHOST_WS_RE =
  /^ws:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+(\?.*)?$/

export const TOKEN_RE = /^[a-zA-Z0-9_-]{20,}$/

const MAX_AGENT_LABEL_LENGTH = 64
const MAX_AGENT_CWD_LENGTH = 512
// No control characters: the values are shown as plain text in the dialog.
// eslint-disable-next-line no-control-regex
const PRINTABLE_RE = /^[^\u0000-\u001f\u007f]+$/

export const isValidAgentLabel = (label: string): boolean =>
  label.length <= MAX_AGENT_LABEL_LENGTH && PRINTABLE_RE.test(label)

export const isValidAgentCwd = (cwd: string): boolean =>
  cwd.length <= MAX_AGENT_CWD_LENGTH && PRINTABLE_RE.test(cwd)
