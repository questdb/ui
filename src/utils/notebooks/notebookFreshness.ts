import { getBufferActionSeq } from "./notebookAIBridge"

// One home for the "has the user edited this buffer since the agent last read
// it?" gate. A buffer's action seq advances only on user edits (see
// notebookAIBridge); the agent records the seq it read at, and a later mutation
// is stale iff the seq moved. The read baseline is stored per instance so each
// dispatcher owns its own lifetime — per turn for chat, per session for MCP.

type FreshnessVerdict = "fresh" | "not_fetched" | "stale"

export type NotebookFreshness = {
  recordRead: (bufferId: number, seq: number, readAtGeneration?: number) => void
  getReadSeq: (bufferId: number) => number | undefined
  assertFresh: (bufferId: number) => FreshnessVerdict
  generation: () => number
  reset: () => void
}

export const captureReadSeq = (bufferId: number): number =>
  getBufferActionSeq(bufferId)

export const createNotebookFreshness = (
  seed?: Iterable<readonly [number, number]>,
): NotebookFreshness => {
  const readSeq = new Map<number, number>(seed)
  let generation = 0
  return {
    recordRead: (bufferId, seq, readAtGeneration) => {
      if (readAtGeneration !== undefined && readAtGeneration !== generation) {
        return
      }
      readSeq.set(bufferId, seq)
    },
    getReadSeq: (bufferId) => readSeq.get(bufferId),
    assertFresh: (bufferId) => {
      const baseline = readSeq.get(bufferId)
      if (baseline === undefined) return "not_fetched"
      return getBufferActionSeq(bufferId) === baseline ? "fresh" : "stale"
    },
    generation: () => generation,
    reset: () => {
      readSeq.clear()
      generation += 1
    },
  }
}
