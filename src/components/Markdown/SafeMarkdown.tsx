import React, { createContext, useContext, useMemo } from "react"
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
//     noreferrer"; other protocols are passed through react-markdown's default
//     urlTransform (which neutralizes javascript: etc.). That default also
//     drops data: and file: URLs, so image sources keep data:image/ and
//     file: explicitly; a file: source is never loaded, only named.
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
  /(?<=\]\(\s*<?)data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g

const InlineImagesContext = createContext<string[]>([])

const withInlineImagesKeyed = (
  markdown: string,
): { markdown: string; images: string[] } => {
  const images: string[] = []
  const keyed = markdown.replace(INLINE_IMAGE_DATA, (data) => {
    images.push(data)
    return `${INLINE_IMAGE_KEY}${images.length - 1}`
  })
  return { markdown: keyed, images }
}

const useImageSrc = (src?: string | Blob): string | undefined => {
  const images = useContext(InlineImagesContext)
  if (typeof src !== "string" || !src.startsWith(INLINE_IMAGE_KEY)) {
    return typeof src === "string" ? src : undefined
  }
  return images[Number(src.slice(INLINE_IMAGE_KEY.length))]
}

const isHttpUrl = (value?: string): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value)

const isSafeImageSrc = (value?: string): value is string =>
  typeof value === "string" &&
  (/^https?:\/\//i.test(value) || /^data:image\//i.test(value))

const SafeLink = ({ children, href, ...props }: React.ComponentProps<"a">) => (
  <a
    href={href}
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
  const src = useImageSrc(rawSrc)
  return isSafeImageSrc(src) ? (
    <img src={src} alt={alt ?? ""} {...props} />
  ) : null
}

const DropImage = () => null

const isWebLink = (href: string): boolean =>
  /^(https?:|mailto:)/i.test(href) || href.startsWith("#")

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
  const src = useImageSrc(rawSrc)
  if (typeof src !== "string" || !src.trim()) return null
  if (/^data:image\//i.test(src))
    return <img src={src} alt={alt ?? ""} {...props} />
  if (/^https?:\/\//i.test(src)) {
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

const urlTransform: UrlTransform = (url, key) =>
  key === "src" && /^(data:image\/|file:|inline-image:)/i.test(url)
    ? url
    : defaultUrlTransform(url)

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

  const keyed = useMemo(() => withInlineImagesKeyed(children), [children])

  return (
    <InlineImagesContext.Provider value={keyed.images}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={merged}
        urlTransform={
          allowImages === "inline" ? inlineUrlTransform : urlTransform
        }
      >
        {keyed.markdown}
      </ReactMarkdown>
    </InlineImagesContext.Provider>
  )
}
