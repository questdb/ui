import React from "react"
import styled from "styled-components"

export type CommandTokenRole =
  | "launcher"
  | "package"
  | "subcommand"
  | "argument"
  | "flag"
  | "value"

export type CommandToken = { text: string; role: CommandTokenRole }

// A shell command split into the parts a reader scans for: what runs it
// (`npx @questdb/mcp-server-questdb@1.0.0`), what it does (`connect <url>`),
// and each option with its value (`--agent codex`).
export const commandSegmentsOf = (command: string): CommandToken[][] => {
  const words = command.trim().split(/\s+/)
  const segments: CommandToken[][] = []
  let rest = words
  if (rest.length >= 2) {
    segments.push([
      { text: rest[0], role: "launcher" },
      { text: rest[1], role: "package" },
    ])
    rest = rest.slice(2)
  }
  const action: CommandToken[] = []
  while (rest.length > 0 && !rest[0].startsWith("-")) {
    action.push({
      text: rest[0],
      role: action.length === 0 ? "subcommand" : "argument",
    })
    rest = rest.slice(1)
  }
  if (action.length > 0) segments.push(action)
  while (rest.length > 0) {
    const option: CommandToken[] = [{ text: rest[0], role: "flag" }]
    rest = rest.slice(1)
    if (rest.length > 0 && !rest[0].startsWith("-")) {
      option.push({ text: rest[0], role: "value" })
      rest = rest.slice(1)
    }
    segments.push(option)
  }
  return segments
}

const Root = styled.span`
  display: block;
`

// A part stays on one line when it fits; when it does not, it wraps between
// its words, never inside one.
// The first part starts with a shell prompt, which marks a terminal command.
// It is not part of the text, so copying leaves it out; it sits inside the
// part so it never stays alone on a line.
const Segment = styled.span<{ $prompt: boolean }>`
  display: inline-block;
  max-width: 100%;
  vertical-align: top;

  ${({ $prompt, theme }) =>
    $prompt &&
    `
    &::before {
      content: "$ ";
      color: ${theme.color.contentDisabled};
    }
  `}
`

// Words never break, even at a hyphen (`mcp-server`, `--agent`), except a
// URL too long for any line.
const Token = styled.span<{ $role: CommandTokenRole }>`
  white-space: ${({ $role }) => ($role === "argument" ? "normal" : "nowrap")};
  overflow-wrap: ${({ $role }) =>
    $role === "argument" ? "anywhere" : "normal"};
  color: ${({ theme, $role }) =>
    $role === "launcher"
      ? theme.color.contentSecondary
      : $role === "package"
        ? theme.color.statusInfo
        : $role === "flag"
          ? theme.color.contentAccent
          : $role === "argument"
            ? theme.color.contentSecondary
            : theme.color.contentPrimary};
  font-weight: ${({ $role }) => ($role === "subcommand" ? 600 : "inherit")};
`

// Shows a command for the user to copy and run. Copying gives the plain
// one-line command.
export const CommandText = ({ command }: { command: string }) => {
  const onCopy = (event: React.ClipboardEvent) => {
    const selected = window.getSelection()?.toString()
    if (!selected) return
    event.preventDefault()
    event.clipboardData.setData(
      "text/plain",
      selected.replace(/\s+/g, " ").trim(),
    )
  }

  return (
    <Root onCopy={onCopy} data-command={command}>
      {commandSegmentsOf(command).map((segment, i) => (
        <React.Fragment key={segment.map((token) => token.text).join(" ")}>
          {i > 0 && " "}
          <Segment $prompt={i === 0}>
            {segment.map((token, j) => (
              <React.Fragment key={`${token.role}:${token.text}`}>
                {j > 0 && " "}
                <Token $role={token.role}>{token.text}</Token>
              </React.Fragment>
            ))}
          </Segment>
        </React.Fragment>
      ))}
    </Root>
  )
}
