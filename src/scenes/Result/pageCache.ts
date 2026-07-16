import type { ResultGridRow } from "../../components/ResultGrid"
import type { QueryRawResult } from "../../utils"
import { PAGE_SIZE } from "./nextPageWindow"
import { splitPagePair, type PageFetchPlan } from "./pageFetchPlan"

export type PageCache = Map<number, ResultGridRow[]>

export const getRowFromCache = (
  cache: PageCache,
  index: number,
): ResultGridRow | undefined => {
  const page = cache.get(Math.floor(index / PAGE_SIZE))
  return page ? page[index % PAGE_SIZE] : undefined
}

export const isPageEmpty = (cache: PageCache, page: number): boolean => {
  const data = cache.get(page)
  return !data || data.length === 0
}

export const purgeOutlierPages = (
  cache: PageCache,
  loPage: number,
  hiPage: number,
): void => {
  for (const page of Array.from(cache.keys())) {
    if (page < loPage || page > hiPage) {
      cache.delete(page)
    }
  }
}

export const applyFetchedPages = (
  cache: PageCache,
  plan: PageFetchPlan,
  dataset: ResultGridRow[],
): void => {
  if (plan.kind === "pair") {
    const { first, second } = splitPagePair(dataset)
    cache.set(plan.firstPage, first)
    cache.set(plan.secondPage, second)
  } else if (plan.kind === "single") {
    cache.set(plan.page, dataset)
  }
}

export const applyPageResponse = (
  cache: PageCache,
  plan: PageFetchPlan,
  response: QueryRawResult,
  requestedGeneration: number,
  currentGeneration: number,
): boolean => {
  if (requestedGeneration !== currentGeneration) return false
  if (!("dataset" in response) || response.dataset === undefined) return false
  applyFetchedPages(cache, plan, response.dataset)
  return true
}
