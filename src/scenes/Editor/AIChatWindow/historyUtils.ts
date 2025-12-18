import { formatDistance } from "date-fns"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import type { AIConversation } from "../../../providers/AIConversationProvider/types"

export type DateGroup = {
  label: string
  conversations: AIConversation[]
}

export function getRelativeDateLabel(timestamp: number): string {
  const userLocale = fetchUserLocale()
  const locale = getLocaleFromLanguage(userLocale)

  return formatDistance(timestamp, new Date().getTime(), { locale }) + " ago"
}

export function groupConversationsByDate(
  conversations: AIConversation[],
): DateGroup[] {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  const groups = new Map<string, AIConversation[]>()

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

export function filterConversations(
  conversations: AIConversation[],
  searchQuery: string,
): AIConversation[] {
  if (!searchQuery.trim()) {
    return conversations
  }

  const query = searchQuery.toLowerCase().trim()
  return conversations.filter((conv) =>
    conv.conversationName.toLowerCase().includes(query),
  )
}
