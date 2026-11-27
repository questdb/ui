// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { MAX_IMAGE_BYTES, readImages } from "./ImageAttachments"

const file = (name: string, type: string, size = 4) =>
  new File([new Uint8Array(size)], name, { type })

describe("readImages", () => {
  it("reads images as base64, and says why it skipped the others", async () => {
    // When
    const { images, error } = await readImages(
      [file("chart.png", "image/png"), file("notes.txt", "text/plain")],
      4,
    )

    // Then
    expect(images).toEqual([{ mimeType: "image/png", data: "AAAAAA==" }])
    expect(error).toBe("Attach PNG, JPEG, GIF or WebP images.")
  })

  it("takes no image over 5 MB, and no more than there is room for", async () => {
    expect(
      (await readImages([file("big.png", "image/png", MAX_IMAGE_BYTES + 1)], 4))
        .error,
    ).toBe("big.png is larger than 5 MB.")
    const { images, error } = await readImages(
      [file("a.png", "image/png"), file("b.png", "image/png")],
      1,
    )
    expect(images).toHaveLength(1)
    expect(error).toBe("A message takes up to 4 images.")
  })
})
