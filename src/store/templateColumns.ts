import { Dexie } from "dexie"
import { db } from "./db"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"

// Grid column layouts live in localStorage, outside the notebook document,
// so a template's authored-content check never sees them. Arranging columns
// customizes the notebook all the same: it detaches it from its template, as
// a content edit does (bufferStore.update).
export const markTemplateColumnsCustomized = async (
  id: number,
): Promise<void> => {
  const templateId = await db.transaction("rw", db.buffers, async () => {
    const buffer = await db.buffers.get(id)
    if (buffer?.templateId === undefined) return undefined
    await db.buffers.update(id, { templateId: undefined })
    return buffer.templateId
  })
  if (templateId === undefined) return
  void Dexie.ignoreTransaction(() =>
    trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_PERSONALIZE, {
      templateId,
      reason: "columns",
    }),
  )
}
