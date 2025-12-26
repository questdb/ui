import { useState, useEffect, useMemo } from "react"
import { formatDistance } from "date-fns"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import type { ConversationMeta } from "../../../store/db"

export type DateGroup = {
  label: string
  conversations: ConversationMeta[]
}

const UPDATE_INTERVAL_MS = 60_000

export function getRelativeDateLabel(timestamp: number): string {
  const userLocale = fetchUserLocale()
  const locale = getLocaleFromLanguage(userLocale)

  return formatDistance(timestamp, new Date().getTime(), { locale }) + " ago"
}

function groupConversationsByDate(
  conversations: ConversationMeta[],
): DateGroup[] {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  const groups = new Map<string, ConversationMeta[]>()

  for (const conv of sorted) {
    const label = getRelativeDateLabel(conv.updatedAt)
    const existing = groups.get(label) || []
    groups.set(label, [...existing, conv])
  }

  const result: DateGroup[] = []
  const seenLabels = new Set<string>()

  for (const conv of sorted) {
    const label = getRelativeDateLabel(conv.updatedAt)
    if (!seenLabels.has(label)) {
      seenLabels.add(label)
      result.push({
        label,
        conversations: groups.get(label) || [],
      })
    }
  }

  return result
}

export function useGroupedConversations(
  conversations: ConversationMeta[],
): DateGroup[] {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  return useMemo(
    () => groupConversationsByDate(conversations),
    [conversations, tick],
  )
}

export function filterConversations(
  conversations: ConversationMeta[],
  searchQuery: string,
): ConversationMeta[] {
  if (!searchQuery.trim()) {
    return conversations
  }

  const query = searchQuery.toLowerCase().trim()
  return conversations.filter((conv) =>
    conv.conversationName.toLowerCase().includes(query),
  )
}
