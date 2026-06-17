import React from "react"
import ReactMarkdown, { type Components, type Options } from "react-markdown"
import remarkGfm from "remark-gfm"

// The security boundary for every markdown surface in the app (notebook
// markdown cells, AI chat, News). It renders only the configured
// <ReactMarkdown> — no wrapper element — so each call site keeps its own
// styled container.
//
// Guarantees:
//   - No raw HTML: react-markdown@8 escapes raw HTML by default and we never
//     add rehype-raw, so embedded <script>/<img onerror> stay inert text.
//   - Safe links: http(s) links open in a new tab with rel="noopener
//     noreferrer"; other protocols are passed through react-markdown's default
//     uriTransformer (which neutralizes javascript: etc.).
//   - Images off by default: dropped entirely unless allowImages is set, in
//     which case only http(s)/data:image sources render.

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

const SafeImage = ({ src, alt, ...props }: React.ComponentProps<"img">) =>
  isSafeImageSrc(src) ? <img src={src} alt={alt ?? ""} {...props} /> : null

const DropImage = () => null

type SafeMarkdownProps = {
  children: string
  allowImages?: boolean
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
    a: SafeLink,
    ...(allowImages ? { img: SafeImage } : {}),
    // Caller overrides (e.g. chat's LiteEditor code block) layer on top...
    ...components,
    // ...but image policy is enforced LAST so a caller can never re-enable
    // images when allowImages is false.
    ...(allowImages ? {} : { img: DropImage }),
  }

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={merged}>
      {children}
    </ReactMarkdown>
  )
}
