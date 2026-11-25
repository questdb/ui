import { db } from "../../../../store/db"
import { requireNotAborted, type PreparedVariables } from "./prepareVariables"

export const commitVariables = (
  owner: string,
  prepared: PreparedVariables,
  saveSettings: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> =>
  db.transaction(
    "rw",
    db.buffers,
    db.notebook_options,
    db.notebook_globals,
    async () => {
      requireNotAborted(signal)
      await saveSettings()
      await db.notebook_options.where("owner").equals(owner).delete()
      await db.notebook_options.bulkPut(
        Object.entries(prepared.options).map(([name, fetched]) => ({
          owner,
          name,
          options: fetched.options,
          fetchedAt: fetched.fetchedAt,
          context: fetched.context,
        })),
      )
      requireNotAborted(signal)
    },
  )
