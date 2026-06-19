import type { ResultGridRow } from "../../components/ResultGrid/types"
import { PAGE_SIZE } from "./nextPageWindow"

// What `usePagedDataSource` should fetch for a requested page pair, decided
// purely from which of the two pages are already cached.
export type PageFetchPlan =
  | {
      kind: "pair"
      lo: number
      hi: number
      firstPage: number
      secondPage: number
    }
  | { kind: "single"; lo: number; hi: number; page: number }
  | { kind: "none" }

export const planPageFetch = (
  p1: number,
  p2: number,
  isEmptyPage: (page: number) => boolean,
): PageFetchPlan => {
  if (p1 !== p2 && isEmptyPage(p1) && isEmptyPage(p2)) {
    const lo = p1 * PAGE_SIZE
    return {
      kind: "pair",
      lo,
      hi: lo + PAGE_SIZE * (p2 - p1 + 1),
      firstPage: p1,
      secondPage: p2,
    }
  }
  if (isEmptyPage(p1) && (!isEmptyPage(p2) || p1 === p2)) {
    const lo = p1 * PAGE_SIZE
    return { kind: "single", lo, hi: lo + PAGE_SIZE, page: p1 }
  }
  if ((!isEmptyPage(p1) || p1 === p2) && isEmptyPage(p2)) {
    const lo = p2 * PAGE_SIZE
    return { kind: "single", lo, hi: lo + PAGE_SIZE, page: p2 }
  }
  return { kind: "none" }
}

export const fetchRangeForPlan = (
  plan: PageFetchPlan,
): { lo: number; hi: number } | null =>
  plan.kind === "none" ? null : { lo: plan.lo + 1, hi: plan.hi }

export const splitPagePair = (
  dataset: ResultGridRow[],
): { first: ResultGridRow[]; second: ResultGridRow[] } => {
  const remainder = dataset.slice()
  const first = remainder.splice(0, PAGE_SIZE)
  return { first, second: remainder }
}
