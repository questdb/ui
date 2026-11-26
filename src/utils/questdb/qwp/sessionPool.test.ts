import { afterEach, describe, expect, it, vi } from "vitest"
import type { QwpEgressSession } from "@questdb/browser-client"
import { QwpSessionPool } from "./sessionPool"

type FakeSession = QwpEgressSession & { drop: () => void }

// Sessions their pool closed.
const closedSessions = new Set<QwpEgressSession>()
const wasClosed = (session: QwpEgressSession) => closedSessions.has(session)

const fakeSession = (): FakeSession => {
  let resolveClosed!: () => void
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })
  const session = {
    closed,
    close: () => {
      closedSessions.add(session)
      resolveClosed()
      return Promise.resolve()
    },
    drop: () => resolveClosed(),
  } as unknown as FakeSession
  return session
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const pool = (maxSessions = 2, idleTimeoutMs = 60_000) => {
  const sessions: FakeSession[] = []
  const connect = vi.fn(() => {
    const session = fakeSession()
    sessions.push(session)
    return Promise.resolve(session)
  })
  return {
    sessions,
    connect,
    pool: new QwpSessionPool(connect, maxSessions, idleTimeoutMs),
  }
}

const signal = () => new AbortController().signal

afterEach(() => {
  vi.useRealTimers()
})

describe("QwpSessionPool", () => {
  it("reuses a returned session", async () => {
    const { pool: sessions, connect } = pool()
    const first = await sessions.acquire(signal())
    first.release(true)
    const second = await sessions.acquire(signal())

    expect(second.session).toBe(first.session)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("opens a session per concurrent request up to its limit", async () => {
    const { pool: sessions, connect } = pool(2)
    const first = await sessions.acquire(signal())
    const second = await sessions.acquire(signal())
    let third: Awaited<ReturnType<QwpSessionPool["acquire"]>> | undefined
    const waiting = sessions.acquire(signal()).then((lease) => {
      third = lease
    })
    await flush()

    expect(connect).toHaveBeenCalledTimes(2)
    expect(third).toBeUndefined()

    second.release(true)
    await waiting
    expect(third?.session).toBe(second.session)
    first.release(true)
  })

  it("closes a session returned as not reusable", async () => {
    const { pool: sessions, connect } = pool(1)
    const first = await sessions.acquire(signal())
    first.release(false)
    const second = await sessions.acquire(signal())

    expect(wasClosed(first.session)).toBe(true)
    expect(second.session).not.toBe(first.session)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it("does not lease a session the server closed", async () => {
    const { pool: sessions, sessions: opened } = pool(1)
    const first = await sessions.acquire(signal())
    first.release(true)
    opened[0].drop()
    await flush()

    const second = await sessions.acquire(signal())
    expect(second.session).toBe(opened[1])
  })

  it("closes a session that stays idle", async () => {
    vi.useFakeTimers()
    const { pool: sessions } = pool(1, 1_000)
    const lease = await sessions.acquire(signal())
    lease.release(true)

    vi.advanceTimersByTime(999)
    expect(wasClosed(lease.session)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(wasClosed(lease.session)).toBe(true)
    expect(sessions.openSessions).toBe(0)
  })

  it("never reuses a session after a reset", async () => {
    const { pool: sessions } = pool(2)
    const idle = await sessions.acquire(signal())
    const leased = await sessions.acquire(signal())
    idle.release(true)

    sessions.reset()
    expect(wasClosed(idle.session)).toBe(true)
    expect(wasClosed(leased.session)).toBe(false)

    leased.release(true)
    expect(wasClosed(leased.session)).toBe(true)
    const next = await sessions.acquire(signal())
    expect([idle.session, leased.session]).not.toContain(next.session)
  })

  it("closes a session opened across a reset", async () => {
    let finishConnect!: (session: QwpEgressSession) => void
    const opening = new QwpSessionPool(
      () =>
        new Promise<QwpEgressSession>((resolve) => {
          finishConnect = resolve
        }),
      1,
      60_000,
    )
    const acquired = opening.acquire(signal())
    await flush()
    opening.reset()
    const session = fakeSession()
    finishConnect(session)

    await expect(acquired).rejects.toMatchObject({ name: "AbortError" })
    expect(wasClosed(session)).toBe(true)
    expect(opening.openSessions).toBe(0)
  })

  it("keeps a session its request gave up while it opened", async () => {
    let finishConnect!: (session: QwpEgressSession) => void
    const connect = vi.fn(
      () =>
        new Promise<QwpEgressSession>((resolve) => {
          finishConnect = resolve
        }),
    )
    const opening = new QwpSessionPool(connect, 1, 60_000)
    const controller = new AbortController()
    const acquired = opening.acquire(controller.signal)
    await flush()
    controller.abort()
    const session = fakeSession()
    finishConnect(session)

    await expect(acquired).rejects.toMatchObject({ name: "AbortError" })
    await expect(opening.acquire(signal())).resolves.toMatchObject({ session })
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("stops waiting for a session when its request is aborted", async () => {
    const { pool: sessions } = pool(1)
    const lease = await sessions.acquire(signal())
    const controller = new AbortController()
    const waiting = sessions.acquire(controller.signal)
    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" })
    lease.release(true)
    await expect(sessions.acquire(signal())).resolves.toMatchObject({
      session: lease.session,
    })
  })

  it("frees the slot of a session that failed to open", async () => {
    const failing = new QwpSessionPool(
      () => Promise.reject(new Error("upgrade failed")),
      1,
      60_000,
    )
    await expect(failing.acquire(signal())).rejects.toThrow("upgrade failed")
    expect(failing.openSessions).toBe(0)
  })

  it("keeps a prewarmed session for the next request", async () => {
    const { pool: sessions, connect } = pool(1)
    await sessions.prewarm(signal())
    await sessions.acquire(signal())

    expect(connect).toHaveBeenCalledTimes(1)
  })
})
