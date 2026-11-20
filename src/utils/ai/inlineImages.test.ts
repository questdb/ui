import { describe, expect, it } from "vitest"
import { withoutInlineImages } from "./inlineImages"

describe("withoutInlineImages", () => {
  it("leaves a placeholder for an image an agent sent, and keeps the rest", () => {
    expect(
      withoutInlineImages(
        "See ![Chart](data:image/png;base64,AAAA) and ![](data:image/jpeg;base64,BBBB). ![web](https://x/y.png)",
      ),
    ).toBe("See [image: Chart] and [image]. ![web](https://x/y.png)")
  })
})
