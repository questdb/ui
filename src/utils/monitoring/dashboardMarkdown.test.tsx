import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildMonitoringDashboard } from "./dashboard"
import { SafeMarkdown } from "../../components/Markdown/SafeMarkdown"

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const titleHtml = (name: string, kind: "table" | "matview") =>
  renderToStaticMarkup(
    <SafeMarkdown>
      {
        buildMonitoringDashboard({ name, kind, telemetryEnabled: true })
          .cells[0].value
      }
    </SafeMarkdown>,
  )

// The heading shows the target name as text, whatever it looks like.
describe("monitoring dashboard title", () => {
  it.each([
    ["table", "www.example.com"],
    ["matview", "ops@example.com"],
    ["table", "a&lt;b"],
    ["matview", "x_y*z_"],
    ["table", "`tick`"],
  ] as const)("renders the %s name %s as plain text", (kind, name) => {
    const html = `${titleHtml(name, kind).split("</h1>")[0]}</h1>`
    expect(html).not.toContain("<a")
    expect(html).not.toContain("<em")
    expect(html).not.toContain("<strong")
    expect(html).toContain(`<code>${escapeHtml(name)}</code></h1>`)
  })
})
