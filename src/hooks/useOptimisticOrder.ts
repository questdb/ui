import { useEffect, useMemo, useState } from "react"

type Id = string | number

const sameOrder = (a: Id[], b: Id[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

const moveItem = <T>(items: T[], fromIndex: number, toIndex: number) => {
  const next = items.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

const applyOrder = <T>(
  items: T[],
  getId: (item: T) => Id,
  order: Id[] | null,
) => {
  if (!order) return items
  const byId = new Map(items.map((item) => [getId(item), item]))
  const ordered = order
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined)
  const rest = items.filter((item) => !order.includes(getId(item)))
  return [...ordered, ...rest]
}

export const useOptimisticOrder = <T>(items: T[], getId: (item: T) => Id) => {
  const [pendingOrder, setPendingOrder] = useState<Id[] | null>(null)

  const ids = useMemo(() => items.map(getId), [items])

  const displayedItems = useMemo(
    () => applyOrder(items, getId, pendingOrder),
    [items, pendingOrder],
  )

  const applyMove = (fromIndex: number, toIndex: number) => {
    setPendingOrder(moveItem(displayedItems.map(getId), fromIndex, toIndex))
  }

  useEffect(() => {
    if (pendingOrder === null) return
    const idSetChanged =
      pendingOrder.length !== ids.length ||
      pendingOrder.some((id) => !ids.includes(id))
    if (idSetChanged || sameOrder(pendingOrder, ids)) {
      setPendingOrder(null)
    }
  }, [ids, pendingOrder])

  return { displayedItems, applyMove }
}
