// A command the user should run ends some errors in backticks, like
// "… then accept the connection: `npx … connect …`".
const TRAILING_COMMAND_RE = /^([\s\S]*?)\s*`((?:npx|node) [^`]+)`\.?$/

export const chatErrorPartsOf = (
  error: string,
): { text: string; command: string | null } => {
  const match = TRAILING_COMMAND_RE.exec(error)
  return match
    ? { text: match[1], command: match[2] }
    : { text: error, command: null }
}
