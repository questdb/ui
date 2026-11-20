// An image an agent sent is kept in its reply as a data URL, which can run to
// a megabyte. A model reading the conversation back gets a placeholder.
const INLINE_IMAGE = /!\[([^\]]*)\]\(data:image\/[^)]*\)/g

export const withoutInlineImages = (text: string): string =>
  text.includes("](data:image/")
    ? text.replace(INLINE_IMAGE, (_match, alt: string) =>
        alt ? `[image: ${alt}]` : "[image]",
      )
    : text
