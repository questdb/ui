// Loopback-only WS guards against reflected CSRF via attacker-controlled
// ws:// deep links. Token floor matches the bridge's token-mint length.

export const LOCALHOST_WS_RE =
  /^ws:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+(\?.*)?$/

export const TOKEN_RE = /^[a-zA-Z0-9_-]{20,}$/

// The agent's name and folder are only shown in the consent dialog, so they
// are cleaned and cut rather than rejected: rejecting them would hide the
// warning that the agent runs commands. The folder limit is Linux's PATH_MAX.
const MAX_AGENT_LABEL_LENGTH = 128
const MAX_AGENT_CWD_LENGTH = 4096
const DEFAULT_AGENT_LABEL = "Coding agent"
// Control and bidirectional-override characters could hide or reorder the
// text the dialog shows.
const UNSAFE_DISPLAY_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

const toDisplayText = (value: string, maxLength: number): string => {
  const characters = Array.from(
    value.replace(UNSAFE_DISPLAY_RE, "\uFFFD").trim(),
  )
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join("")}…`
    : characters.join("")
}

export const agentLabelForDisplay = (label: string): string =>
  toDisplayText(label, MAX_AGENT_LABEL_LENGTH) || DEFAULT_AGENT_LABEL

export const agentCwdForDisplay = (cwd: string): string =>
  toDisplayText(cwd, MAX_AGENT_CWD_LENGTH)
