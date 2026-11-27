import { describe, expect, it } from "vitest"
import {
  cutInlineImages,
  pasteInlineImages,
  withoutInlineImages,
} from "./inlineImages"

describe("withoutInlineImages", () => {
  it("leaves a placeholder for an image an agent sent, and keeps the rest", () => {
    expect(
      withoutInlineImages(
        "See ![Chart](data:image/png;base64,AAAA) and ![](data:image/jpeg;base64,BBBB). ![web](https://x/y.png)",
      ),
    ).toBe("See [image: Chart] and [image]. ![web](https://x/y.png)")
  })
})

describe("cutInlineImages", () => {
  it.each([
    {
      name: "images with and without alt text, and a web image",
      text: "See ![Chart](data:image/png;base64,AAAA) and ![](data:image/jpeg;base64,BBBB). ![web](https://x/y.png)",
      cutText: "See ![Chart]() and ![](). ![web](https://x/y.png)",
      cuts: [
        { at: 13, dataUrl: "data:image/png;base64,AAAA" },
        { at: 23, dataUrl: "data:image/jpeg;base64,BBBB" },
      ],
    },
    {
      name: "an image that starts and ends the text",
      text: "![a](data:image/png;base64,AAAA)",
      cutText: "![a]()",
      cuts: [{ at: 5, dataUrl: "data:image/png;base64,AAAA" }],
    },
    {
      name: "no inline image",
      text: "Plain ![web](https://x/y.png)",
      cutText: "Plain ![web](https://x/y.png)",
      cuts: [],
    },
  ])(
    "cuts the data URLs out of $name, and pasting puts them back",
    ({ text, cutText, cuts }) => {
      // When
      const cut = cutInlineImages(text)

      // Then
      expect(cut).toEqual({ text: cutText, cuts })
      expect(pasteInlineImages(cut.text, cut.cuts)).toBe(text)
    },
  )
})
