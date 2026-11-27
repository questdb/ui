import React, { useMemo } from "react"
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type Options,
  type UrlTransform,
} from "react-markdown"
import remarkGfm from "remark-gfm"

// The security boundary for every markdown surface in the app (notebook
// markdown cells, AI chat, News). It renders only the configured
// <ReactMarkdown> — no wrapper element — so each call site keeps its own
// styled container.
//
// Guarantees:
//   - No raw HTML: react-markdown@10 escapes raw HTML by default and we never
//     add rehype-raw, so embedded <script>/<img onerror> stay inert text.
//   - Safe links: http(s) links open in a new tab with rel="noopener
//     noreferrer"; tel: links are kept; other protocols are passed through
//     react-markdown's default urlTransform, which empties javascript: and
//     other unsafe URLs. An emptied link renders without an href, so a click
//     does nothing instead of reloading the console. The default also drops
//     data: and file: URLs, so image sources keep data:image/ and file:
//     explicitly; a file: source is never loaded, only named.
//   - Images off by default: dropped entirely unless allowImages is set, in
//     which case only http(s)/data:image sources render. allowImages="inline"
//     renders data:image sources only and links remote ones, so text a model
//     writes cannot make the browser fetch an address it picked (and send
//     data out in it). A local file it names is shown by its name, and a
//     link to one is text with the path: the browser cannot open either,
//     and would read a path as an address on the console's own server.

// Parsing markdown is slow on a long URL: a message with a 2 MB inline image
// takes over a second, on every streamed piece. Each image's data is swapped
// for a short key before parsing and put back when the image renders.
const INLINE_IMAGE_KEY = "inline-image:"
const INLINE_IMAGE_DATA =
  /(\]\(\s*<?)(data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+)/g

type MarkdownNode = {
  value?: string
  url?: string
  alt?: string
  children?: MarkdownNode[]
}

const withInlineImagesKeyed = (markdown: string) => {
  const prefixes = new Set(
    Array.from(markdown.matchAll(/inline-image:(\d+):/g), (match) => match[1]),
  )
  let next = 0
  while (prefixes.has(String(next))) next++
  const prefix = `${INLINE_IMAGE_KEY}${next}:`
  const images: string[] = []
  const keyed = markdown.replace(
    INLINE_IMAGE_DATA,
    (_, destination: string, data: string) => {
      images.push(data)
      return `${destination}${prefix}${images.length - 1}`
    },
  )
  const pattern = new RegExp(`${prefix}(\\d+)`, "g")
  const restore = (value: string) =>
    value.replace(pattern, (key, index) => images[Number(index)] ?? key)
  // Restore keys after parsing, not just in destinations: text and code
  // examples can contain literal Markdown image syntax too.
  const restoreInlineImages = () => {
    const visit = (node: MarkdownNode) => {
      if (node.value !== undefined) node.value = restore(node.value)
      if (node.url !== undefined) node.url = restore(node.url)
      if (node.alt !== undefined) node.alt = restore(node.alt)
      node.children?.forEach(visit)
    }
    return visit
  }
  return {
    markdown: keyed,
    restoreInlineImages: images.length ? restoreInlineImages : null,
  }
}

const isHttpUrl = (value?: string): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value)

const isDataImage = (value: string) => /^data:image\//i.test(value)

const isSafeImageSrc = (value?: string): value is string =>
  isHttpUrl(value) || (typeof value === "string" && isDataImage(value))

const SafeLink = ({ children, href, ...props }: React.ComponentProps<"a">) => (
  <a
    href={href || undefined}
    {...(isHttpUrl(href)
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {})}
    {...props}
  >
    {children}
  </a>
)

const SafeImage = ({
  src: rawSrc,
  alt,
  ...props
}: React.ComponentProps<"img">) => {
  const src = typeof rawSrc === "string" ? rawSrc : undefined
  return isSafeImageSrc(src) ? (
    <img src={src} alt={alt ?? ""} {...props} />
  ) : null
}

const DropImage = () => null

const isWebLink = (href: string): boolean =>
  /^(https?:|mailto:|tel:)/i.test(href) || href.startsWith("#")

const InlineLink = (props: React.ComponentProps<"a">) => {
  const { href, children } = props
  if (typeof href !== "string" || !href || isWebLink(href)) {
    return <SafeLink {...props} />
  }
  return (
    <span title={href} data-hook="markdown-local-link">
      {children}
    </span>
  )
}

const InlineImage = ({
  src: rawSrc,
  alt,
  ...props
}: React.ComponentProps<"img">) => {
  const src = rawSrc
  if (typeof src !== "string" || !src.trim()) return null
  if (isDataImage(src)) return <img src={src} alt={alt ?? ""} {...props} />
  if (isHttpUrl(src)) {
    let host: string
    try {
      host = new URL(src).host
    } catch {
      return <span>{alt || "Image unavailable"}</span>
    }
    return (
      <SafeLink
        href={src}
        title="Not loaded automatically"
        data-hook="markdown-remote-image"
      >
        {alt ? `Image: ${alt} (${host})` : `Image (${host})`}
      </SafeLink>
    )
  }
  const name = fileNameOf(src)
  return (
    <span title="Could not be shown" data-hook="markdown-local-image">
      {alt ? `Image: ${alt} (${name})` : `Image (${name})`}
    </span>
  )
}

// The last part of a path or file URL, decoded where it can be.
const fileNameOf = (src: string): string => {
  const name = src.split(/[\\/]/).filter(Boolean).pop() ?? src
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

const urlTransform: UrlTransform = (url, key) => {
  if (key === "src" && (isDataImage(url) || /^file:/i.test(url))) return url
  if (key === "href" && /^tel:/i.test(url)) return url
  return defaultUrlTransform(url)
}

// Chat also keeps file: links, which it shows as text and never opens.
const inlineUrlTransform: UrlTransform = (url, key, node) =>
  key === "href" && /^file:/i.test(url) ? url : urlTransform(url, key, node)

type SafeMarkdownProps = {
  children: string
  allowImages?: boolean | "inline"
  remarkPlugins?: Options["remarkPlugins"]
  components?: Components
}

export const SafeMarkdown = ({
  children,
  allowImages = false,
  remarkPlugins = [remarkGfm],
  components,
}: SafeMarkdownProps) => {
  const merged: Components = {
    a: allowImages === "inline" ? InlineLink : SafeLink,
    ...(allowImages
      ? { img: allowImages === "inline" ? InlineImage : SafeImage }
      : {}),
    // Caller overrides (e.g. chat's LiteEditor code block) layer on top...
    ...components,
    // ...but image policy is enforced LAST so a caller can never re-enable
    // images when allowImages is false.
    ...(allowImages ? {} : { img: DropImage }),
  }

  const keyed = useMemo(
    () =>
      allowImages === "inline"
        ? withInlineImagesKeyed(children)
        : { markdown: children, restoreInlineImages: null },
    [allowImages, children],
  )

  return (
    <ReactMarkdown
      remarkPlugins={
        keyed.restoreInlineImages
          ? [keyed.restoreInlineImages, ...(remarkPlugins ?? [])]
          : remarkPlugins
      }
      components={merged}
      urlTransform={
        allowImages === "inline" ? inlineUrlTransform : urlTransform
      }
    >
      {keyed.markdown}
    </ReactMarkdown>
  )
}
