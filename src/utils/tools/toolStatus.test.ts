import { describe, expect, it } from "vitest"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { toolStatusOf } from "./toolStatus"

describe("toolStatusOf", () => {
  it("gives a console tool the status it shows while it runs", () => {
    // When
    const status = toolStatusOf("get_tables")

    // Then
    expect(status).toBe(AIOperationStatus.RetrievingTables)
  })

  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "has no status for a tool named %s, which the console does not have",
    (name) => {
      // When
      const status = toolStatusOf(name)

      // Then
      expect(status).toBeNull()
    },
  )
})
