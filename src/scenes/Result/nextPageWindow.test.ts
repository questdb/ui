import { describe, it, expect } from "vitest"
import { PAGE_SIZE, nextPageWindow } from "./nextPageWindow"

const DOWN = 1
const UP = -1

describe("nextPageWindow", () => {
  it("does nothing when the scroll indices are not numbers", () => {
    const decision = nextPageWindow(DOWN, NaN, NaN, { loPage: 0, hiPage: 0 })

    expect(decision).toEqual({ loPage: 0, hiPage: 0, load: null })
  })

  it("does not prefetch while the visible range stays within the page", () => {
    // Top third of page 0 — nothing to load yet.
    const decision = nextPageWindow(DOWN, 10, 20, { loPage: 0, hiPage: 0 })

    expect(decision).toEqual({ loPage: 0, hiPage: 0, load: null })
  })

  it("prefetches the next page once scrolling past two thirds of a page", () => {
    // Bottom crosses ⅔ of page 0.
    const decision = nextPageWindow(DOWN, 600, 700, { loPage: 0, hiPage: 0 })

    expect(decision).toEqual({ loPage: 0, hiPage: 1, load: [0, 1] })
  })

  it("prefetches the previous page once scrolling above one third of a page", () => {
    // Top crosses ⅓ of page 5 while scrolling up.
    const decision = nextPageWindow(UP, 5200, 5320, { loPage: 5, hiPage: 5 })

    expect(decision).toEqual({ loPage: 4, hiPage: 5, load: [4, 5] })
  })

  it("loads the landing page after a long jump down", () => {
    // Jump straight to row 5000 from a fresh page-0 window.
    const target = Math.floor(5000 / PAGE_SIZE)
    const decision = nextPageWindow(DOWN, 5000, 5020, { loPage: 0, hiPage: 0 })

    expect(decision).toEqual({
      loPage: target,
      hiPage: target,
      load: [target, target],
    })
  })
})
