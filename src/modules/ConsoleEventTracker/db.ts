import { db } from "../../store/db"

export type TelemetryEvent = {
  id?: number
  created: number
  name: string
  props?: string
}

export const putEvent = async (
  name: string,
  props?: string,
): Promise<boolean> => {
  try {
    await db.events.add({ created: Date.now(), name, props })
    return true
  } catch (e) {
    console.error("Failed to store telemetry event", e)
    return false
  }
}

export const getEntryCount = async (): Promise<number> => {
  try {
    return await db.events.count()
  } catch (e) {
    console.error("Failed to get telemetry event count", e)
    return 0
  }
}

export const getEntriesAfter = async (
  cursor: number,
  limit: number,
): Promise<TelemetryEvent[]> => {
  try {
    return await db.events.where("created").above(cursor).limit(limit).toArray()
  } catch (e) {
    console.error("Failed to read telemetry events from IndexedDB", e)
    return []
  }
}

export const deleteEntriesUpTo = async (created: number): Promise<number> => {
  try {
    const deleteCount = await db.events.where("created").belowOrEqual(created).delete()
    return deleteCount
  } catch (e) {
    console.error("Failed to delete sent telemetry events", e)
    return -1
  }
}

export const trimToMaxRows = async (maxRows: number): Promise<boolean> => {
  try {
    const count = await db.events.count()
    if (count <= maxRows) return true
    const overflow = count - maxRows
    const oldest = await db.events.orderBy("created").limit(overflow).toArray()
    const ids = oldest.map((e) => e.id!)
    await db.events.bulkDelete(ids)
    return true
  } catch (e) {
    console.error("Failed to trim telemetry events in IndexedDB", e)
    return false
  }
}
