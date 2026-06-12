export const PAGE_SIZE = 1000
const ONE_THIRD_PAGE = Math.floor(PAGE_SIZE / 3)
const TWO_THIRDS_PAGE = ONE_THIRD_PAGE * 2

export type PageWindow = { loPage: number; hiPage: number }

// `load` is the page pair to fetch, or null when the range is already covered.
export type PageWindowDecision = PageWindow & { load: [number, number] | null }

export const nextPageWindow = (
  direction: number,
  top: number,
  bottom: number,
  current: PageWindow,
): PageWindowDecision => {
  const { loPage, hiPage } = current
  const unchanged: PageWindowDecision = { loPage, hiPage, load: null }

  if (Number.isNaN(top) || Number.isNaN(bottom)) return unchanged

  const topPage = Math.floor(top / PAGE_SIZE)
  const bottomPage = Math.floor(bottom / PAGE_SIZE)

  if (direction > 0) {
    const bottomInPage = bottom % PAGE_SIZE
    if (topPage >= loPage && bottomPage < hiPage) return unchanged

    if (bottomPage === hiPage) {
      if (bottomInPage > TWO_THIRDS_PAGE) {
        return {
          loPage: bottomPage,
          hiPage: bottomPage + 1,
          load: [bottomPage, bottomPage + 1],
        }
      }
      return unchanged
    }

    if (topPage < bottomPage) {
      return {
        loPage: topPage,
        hiPage: bottomPage,
        load: [topPage, bottomPage],
      }
    }
    if (bottomInPage > TWO_THIRDS_PAGE) {
      return {
        loPage: bottomPage,
        hiPage: bottomPage + 1,
        load: [bottomPage, bottomPage + 1],
      }
    }
    return { loPage: topPage, hiPage: topPage, load: [topPage, topPage] }
  }

  const topInPage = top % PAGE_SIZE
  if (topPage > loPage && bottomPage <= hiPage) return unchanged

  if (topPage === loPage) {
    if (topInPage < ONE_THIRD_PAGE && loPage > 0) {
      return {
        loPage: Math.max(0, topPage - 1),
        hiPage: topPage,
        load: [topPage - 1, topPage],
      }
    }
    return unchanged
  }

  if (topPage < bottomPage) {
    return { loPage: topPage, hiPage: bottomPage, load: [topPage, bottomPage] }
  }
  if (topInPage < ONE_THIRD_PAGE && topPage > 0) {
    return {
      loPage: Math.max(0, topPage - 1),
      hiPage: topPage,
      load: [topPage - 1, topPage],
    }
  }
  return { loPage: topPage, hiPage: topPage, load: [topPage, topPage] }
}
