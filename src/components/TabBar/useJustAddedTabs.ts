import { useEffect, useRef, useState } from "react"
import type { TabProperties } from "./types"

const JUST_ADDED_MS = 500

export const useJustAddedTabs = (tabs: TabProperties[], ready: boolean) => {
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string>>(new Set(tabs.map((tab) => tab.id)))
  const timersRef = useRef<number[]>([])

  const idsKey = tabs.map((tab) => tab.id).join(",")

  useEffect(() => {
    const ids = idsKey === "" ? [] : idsKey.split(",")
    const added = ids.filter((id) => !knownIdsRef.current.has(id))
    knownIdsRef.current = new Set(ids)
    if (!ready || added.length === 0) return

    setJustAddedIds((previous) => new Set([...previous, ...added]))
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== timer)
      setJustAddedIds((previous) => {
        const next = new Set(previous)
        added.forEach((id) => next.delete(id))
        return next
      })
    }, JUST_ADDED_MS)
    timersRef.current.push(timer)
  }, [idsKey, ready])

  useEffect(
    () => () =>
      timersRef.current.forEach((timer) => window.clearTimeout(timer)),
    [],
  )

  return justAddedIds
}
