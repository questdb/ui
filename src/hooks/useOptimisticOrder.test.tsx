// @vitest-environment jsdom
import React from "react"
import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../test/component"
import { useOptimisticOrder } from "./useOptimisticOrder"

let shown: number[] = []
let move: (fromIndex: number, toIndex: number) => void = () => undefined

const Probe = ({ items }: { items: number[] }) => {
  const { displayedItems, applyMove } = useOptimisticOrder(
    items,
    (item) => item,
  )
  shown = displayedItems
  move = applyMove
  return null
}

const renderOrder = (items: number[]) => {
  const { rerender } = renderComponent(<Probe items={items} />)
  return (next: number[]) => rerender(<Probe items={next} />)
}

describe("useOptimisticOrder", () => {
  it("shows a move at once, before the stored order changes", () => {
    // Given three items in stored order
    renderOrder([1, 2, 3])

    // When the last one is moved first
    act(() => move(2, 0))

    // Then the moved order shows
    expect(shown).toEqual([3, 1, 2])
  })

  it("follows a later reorder from elsewhere once the store has caught up", () => {
    // Given a move that the store has saved
    const setItems = renderOrder([1, 2, 3])
    act(() => move(2, 0))
    setItems([3, 1, 2])

    // When another surface reorders the same items
    setItems([1, 3, 2])

    // Then the new stored order shows
    expect(shown).toEqual([1, 3, 2])
  })

  it("places a tab added after a move where the store puts it", () => {
    // Given a move that the store has saved
    const setItems = renderOrder([1, 2, 3])
    act(() => move(2, 0))
    setItems([3, 1, 2])

    // When a tab is inserted after the first one (a duplicated notebook)
    setItems([3, 9, 1, 2])

    // Then it shows next to its source, not at the end
    expect(shown).toEqual([3, 9, 1, 2])
  })
})
