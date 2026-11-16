// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import { questClient } from "../../../utils/questdb/queryClient"
import { raw } from "../TableDetailsDrawer/test/catalogFixtures"
import { SuspensionDialog } from "."

vi.mock("../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

type Reply = Response | Promise<Response>

const walRow = (suspended: boolean) => ({
  name: "trades",
  suspended,
  writerTxn: "1",
  sequencerTxn: "2",
  writerLagTxnCount: "1",
  errorTag: "OUT OF MEMORY",
  errorMessage: "Out of memory",
})

const deferred = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((complete) => {
    resolve = complete
  })
  return {
    promise,
    respond: async (response: Response) => {
      await act(async () => {
        resolve(response)
        await promise
      })
    },
  }
}

// One table on the server: its WAL state, and a hook to hold a request
const walServer = () => {
  const server = {
    suspended: true,
    reads: 0,
    reply: (_query: string): Reply | undefined => undefined,
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost/",
      )
      const query = url.searchParams.get("query") ?? ""
      if (query.startsWith("wal_tables()")) server.reads += 1
      const held = server.reply(query)
      if (held) return held
      if (query.startsWith("wal_tables()"))
        return Response.json(raw([walRow(server.suspended)]))
      if (query === "ALTER TABLE 'trades' RESUME WAL") {
        server.suspended = false
        return Response.json({ ddl: "OK" })
      }
      throw new Error(`Unexpected SQL: ${query}`)
    }),
  )
  return server
}

let setOpen: (open: boolean) => void = () => {}

const Host = () => {
  const [open, setOpenState] = useState(true)
  setOpen = setOpenState
  return (
    <SuspensionDialog
      tableName="trades"
      kind="table"
      open={open}
      onOpenChange={setOpenState}
    />
  )
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const toggle = async (open: boolean) => {
  await act(async () => {
    setOpen(open)
    await Promise.resolve()
  })
}

const resume = async () => {
  await act(async () => {
    fireEvent.click(getHook("schema-suspension-dialog-restart-transaction"))
    await Promise.resolve()
  })
}

const dialog = () => getHook("schema-suspension-dialog")

beforeEach(() => {
  questClient.resetCredentials()
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  })
})

describe("suspension dialog WAL status", () => {
  it("follows the latest WAL read after a resume, and drops reads started before it", async () => {
    // Given
    const server = walServer()
    renderComponent(<Host />)
    await advance(0)
    expect(dialog()).toHaveAttribute("data-suspended", "true")
    const staleRead = deferred()
    server.reply = (query) =>
      query.startsWith("wal_tables()") ? staleRead.promise : undefined
    await advance(1000)
    server.reply = () => undefined
    // When: the resume lands while a read from before it is in flight
    await resume()
    await advance(0)
    await staleRead.respond(Response.json(raw([walRow(true)])))
    // Then
    expect(dialog()).toHaveAttribute("data-suspended", "false")
    expect(dialog()).toHaveTextContent("WAL resumed successfully!")
    expect(getHook("schema-suspension-dialog-dismiss")).toHaveTextContent(
      "Close",
    )
    // When: the table is suspended again while the dialog is open
    server.suspended = true
    await advance(1000)
    // Then
    expect(dialog()).toHaveAttribute("data-suspended", "true")
    expect(dialog()).toHaveTextContent("Table is suspended: trades")
    expect(dialog()).not.toHaveTextContent("WAL resumed successfully!")
    expect(getHook("schema-suspension-dialog-dismiss")).toHaveTextContent(
      "Dismiss",
    )
  })

  it("keeps loading when a read from the previous opening lands", async () => {
    // Given: the first opening's read is slow, and the dialog is closed
    const server = walServer()
    const firstRead = deferred()
    server.reply = (query) =>
      query.startsWith("wal_tables()") ? firstRead.promise : undefined
    renderComponent(<Host />)
    await advance(0)
    await toggle(false)
    const reopenedRead = deferred()
    server.reply = (query) =>
      query.startsWith("wal_tables()") ? reopenedRead.promise : undefined
    // When: the dialog reopens, and then the first opening's read lands
    await toggle(true)
    await advance(0)
    await firstRead.respond(Response.json(raw([walRow(true)])))
    // Then: the dialog waits for its own read instead of reporting a failure
    expect(dialog()).toHaveTextContent("Loading WAL status")
    expect(dialog()).not.toHaveTextContent("Failed to load WAL data")
    // When
    await reopenedRead.respond(Response.json(raw([walRow(true)])))
    // Then
    expect(dialog()).not.toHaveTextContent("Loading WAL status")
    expect(
      getHook("schema-suspension-dialog-restart-transaction"),
    ).toBeEnabled()
  })

  it("loads the reopened dialog when a resume from the previous opening lands", async () => {
    // Given: the resume reaches the server late, after the dialog is closed
    const server = walServer()
    renderComponent(<Host />)
    await advance(0)
    const resumeResponse = deferred()
    server.reply = (query) =>
      query.includes("RESUME WAL") ? resumeResponse.promise : undefined
    await resume()
    await toggle(false)
    // When: the dialog reopens, and the old resume lands while the reopened
    // dialog's first read is in flight
    const reopenedRead = deferred()
    server.reply = (query) =>
      query.startsWith("wal_tables()") ? reopenedRead.promise : undefined
    await toggle(true)
    await advance(0)
    server.suspended = false
    await resumeResponse.respond(Response.json({ ddl: "OK" }))
    await reopenedRead.respond(Response.json(raw([walRow(false)])))
    // Then: the dialog shows its own read, not the old opening's resume
    expect(queryHook("schema-suspension-dialog")).toBeInTheDocument()
    expect(dialog()).not.toHaveTextContent("Loading WAL status")
    expect(dialog()).toHaveAttribute("data-suspended", "false")
    expect(dialog()).toHaveTextContent("WAL is not suspended")
    expect(dialog()).not.toHaveTextContent("WAL resumed successfully!")
  })
})
