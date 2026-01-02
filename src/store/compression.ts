import { compressSync, decompressSync, strToU8, strFromU8 } from "fflate"
import type { ConversationMessage } from "../providers/AIConversationProvider/types"

export function compressMessages(messages: ConversationMessage[]): Uint8Array {
  return compressSync(strToU8(JSON.stringify(messages)))
}

export function decompressMessages(data: Uint8Array): ConversationMessage[] {
  try {
    const result = JSON.parse(
      strFromU8(decompressSync(data)),
    ) as ConversationMessage[]
    return result
  } catch (error) {
    console.error("Failed to decompress messages:", error)
    return []
  }
}
