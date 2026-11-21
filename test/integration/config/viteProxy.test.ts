import { describe, expect, it } from "vitest"
import { loadConfigFromFile } from "vite"

const questDBPaths = [
  "/api",
  "/chk",
  "/exec",
  "/exp",
  "/imp",
  "/preferences",
  "/settings",
  "/warnings",
]

describe("Vite QuestDB proxy", () => {
  it.each(["server", "preview"] as const)(
    "uses the local QuestDB instance in %s mode",
    async (mode) => {
      // Given the console serving through Vite
      const loaded = await loadConfigFromFile({
        command: "serve",
        mode: mode === "server" ? "development" : "production",
        isPreview: mode === "preview",
      })

      // When QuestDB requests match the proxy
      const proxy = loaded?.config[mode]?.proxy ?? {}

      // Then they stay on the local QuestDB instance
      expect(
        questDBPaths.map((path) => {
          const rule = proxy[path]
          return typeof rule === "string" ? rule : rule?.target
        }),
      ).toEqual(questDBPaths.map(() => "http://127.0.0.1:9000"))
    },
  )
})
