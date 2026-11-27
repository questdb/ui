import type React from "react"
import { getTreePageIndex } from "../../utils/treeKeyboard"

type ActivationKeyEvent = Pick<
  React.KeyboardEvent,
  "key" | "target" | "currentTarget"
>

export const isOwnActivationKey = (event: ActivationKeyEvent): boolean =>
  event.target === event.currentTarget &&
  (event.key === "Enter" || event.key === " ")

const ROW_SELECTOR = '[data-hook="tabs-panel-row"]'
const SECTION_SELECTOR = '[role="treeitem"][aria-expanded]'
const ITEM_SELECTOR = '[role="treeitem"]:not([aria-disabled="true"])'

export const canNavigate = (event: React.KeyboardEvent) =>
  !event.defaultPrevented &&
  !event.nativeEvent.isComposing &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  (!event.shiftKey || event.key === "Tab")

const getItemSurface = (item: HTMLElement) =>
  item.querySelector('[data-hook="tabs-panel-section-toggle"]') ?? item

export const focusAndReveal = (
  item: HTMLElement,
  block: ScrollLogicalPosition = "nearest",
) => {
  item.focus({ preventScroll: true })
  getItemSurface(item).scrollIntoView({
    behavior: "instant",
    block,
    inline: "nearest",
  })
}

export const getTabTreeEntry = (
  tree: HTMLElement,
  previous: HTMLElement | null,
) => {
  if (previous?.matches(ITEM_SELECTOR) && tree.contains(previous))
    return previous
  return (
    tree.querySelector<HTMLElement>(`${ITEM_SELECTOR}[aria-current]`) ??
    tree.querySelector<HTMLElement>(ITEM_SELECTOR)
  )
}

export const enterTabListFromFilter = (
  event: React.KeyboardEvent<HTMLInputElement>,
  list: HTMLElement | null,
) => {
  if (event.key !== "ArrowDown" || !canNavigate(event)) return
  const firstRow = list?.querySelector<HTMLElement>(
    `${ITEM_SELECTOR}${ROW_SELECTOR}`,
  )
  const firstSection = list?.querySelector<HTMLElement>(
    `${SECTION_SELECTOR}[aria-expanded="false"]`,
  )
  const first = firstRow ?? firstSection
  if (!first) return
  event.preventDefault()
  focusAndReveal(first)
}

const NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Tab",
])

const getVisibleRange = (
  tree: HTMLElement,
  items: HTMLElement[],
  focusedIndex: number,
) => {
  const viewport = tree.getBoundingClientRect()
  const visibleIndices = items.flatMap((item, index) => {
    const row = getItemSurface(item).getBoundingClientRect()
    return row.bottom > viewport.top && row.top < viewport.bottom ? [index] : []
  })
  return {
    startIndex: visibleIndices[0] ?? focusedIndex,
    endIndex: visibleIndices.at(-1) ?? focusedIndex,
  }
}

export const navigateTabList = (event: React.KeyboardEvent<HTMLDivElement>) => {
  const { key, target, currentTarget } = event
  if (
    !NAVIGATION_KEYS.has(key) ||
    !canNavigate(event) ||
    !(target instanceof HTMLElement) ||
    !target.matches(ITEM_SELECTOR)
  )
    return

  const items = Array.from(
    currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
  )
  const index = items.indexOf(target)
  if (index === -1) return

  let nextIndex = index
  let block: ScrollLogicalPosition = "nearest"
  switch (key) {
    // Section handlers consume Left/Right when the key expands or collapses
    // a group. Left from a child then jumps directly to its section.
    case "ArrowLeft": {
      const parent =
        target.parentElement?.closest<HTMLElement>(SECTION_SELECTOR)
      const parentIndex = parent ? items.indexOf(parent) : -1
      nextIndex = parentIndex === -1 ? index : parentIndex
      break
    }
    case "ArrowUp":
      nextIndex = Math.max(index - 1, 0)
      break
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = Math.min(index + 1, items.length - 1)
      break
    case "Home":
      nextIndex = 0
      break
    case "End":
      nextIndex = items.length - 1
      break
    case "PageUp":
    case "PageDown": {
      const direction = key === "PageUp" ? "up" : "down"
      nextIndex = getTreePageIndex(
        direction,
        index,
        getVisibleRange(currentTarget, items, index),
        items.length,
      )
      block = direction === "up" ? "start" : "end"
      break
    }
    case "Tab":
      nextIndex = index + (event.shiftKey ? -1 : 1)
      // Let the browser leave the tree at its boundaries.
      if (nextIndex < 0 || nextIndex >= items.length) return
      break
  }

  event.preventDefault()
  if (nextIndex !== index) focusAndReveal(items[nextIndex], block)
}

// Move focus before an action removes or moves its row. The section is a
// fallback when this is the only visible tab.
export const focusNeighbourRow = (action: Element) => {
  const row = action.closest(ROW_SELECTOR)
  const tree = action.closest('[role="tree"]')
  if (!row || !tree) return
  const rows = Array.from(
    tree.querySelectorAll<HTMLElement>(`${ITEM_SELECTOR}${ROW_SELECTOR}`),
  )
  const index = rows.findIndex((item) => item === row)
  const neighbour =
    rows[index + 1] ??
    rows[index - 1] ??
    row.parentElement?.closest<HTMLElement>(SECTION_SELECTOR)
  if (neighbour) focusAndReveal(neighbour)
}
