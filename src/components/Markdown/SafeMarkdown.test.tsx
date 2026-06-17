import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SafeMarkdown } from "./SafeMarkdown"

const render = (markdown: string, allowImages = false) =>
  renderToStaticMarkup(
    <SafeMarkdown allowImages={allowImages}>{markdown}</SafeMarkdown>,
  )

describe("SafeMarkdown", () => {
  it("never renders images by default", () => {
    const html = render("![pixel](http://evil.example/track.png)")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("track.png")
  })

  it("renders images when allowImages and src is http(s)/data:image", () => {
    expect(render("![ok](https://example.com/a.png)", true)).toContain("<img")
    expect(render("![ok](data:image/png;base64,iVBORw0KGgo=)", true)).toContain(
      "<img",
    )
  })

  it("drops images with unsafe src even when images are allowed", () => {
    expect(render("![x](javascript:alert(1))", true)).not.toContain("<img")
    expect(render("![x](vbscript:msgbox(1))", true)).not.toContain("<img")
  })

  it("escapes raw HTML — no live script or event-handler element", () => {
    const html = render("<script>alert(1)</script>")
    // Raw HTML is escaped to inert text, never a live element.
    expect(html).not.toContain("<script")
    const imgHtml = render('<img src=x onerror="alert(1)">', true)
    // The raw <img> is escaped (rendered as text), not emitted as an element.
    expect(imgHtml).toContain("&lt;img")
    expect(imgHtml).not.toMatch(/<img[^>]*onerror/i)
  })

  it("opens http(s) links in a new tab with noopener noreferrer", () => {
    const html = render("[site](https://example.com)")
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("does not add target/rel to relative or anchor links", () => {
    const html = render("[here](#section)")
    expect(html).not.toContain('target="_blank"')
  })

  it("neutralizes javascript: link hrefs (react-markdown default)", () => {
    const html = render("[x](javascript:alert(1))")
    expect(html).not.toContain("javascript:alert")
  })

  it("renders GFM tables by default", () => {
    const html = render("| a | b |\n| - | - |\n| 1 | 2 |")
    expect(html).toContain("<table")
  })
})
