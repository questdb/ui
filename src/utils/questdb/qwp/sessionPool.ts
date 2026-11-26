import type { QwpEgressSession } from "@questdb/browser-client"

export type QwpSessionFactory = (
  signal: AbortSignal,
) => Promise<QwpEgressSession>

export type QwpLease = {
  readonly session: QwpEgressSession
  /** Returns the session to the pool once its query has ended. */
  release: (reusable: boolean) => void
}

type Entry = {
  readonly session: QwpEgressSession
  readonly generation: number
  idleTimer?: ReturnType<typeof setTimeout>
  idle: boolean
  closed: boolean
  retired: boolean
}

const abortError = () => new DOMException("Aborted", "AbortError")

/**
 * Query sessions for concurrent console requests. A QWP connection runs one
 * query at a time, so each request leases a session of its own, up to
 * `maxSessions`; further requests wait for a session to be returned.
 * Sessions idle for `idleTimeoutMs` are closed.
 */
export class QwpSessionPool {
  private readonly idle: Entry[] = []
  private readonly waiters = new Set<() => void>()
  // Open and opening sessions.
  private size = 0
  private generation = 0

  constructor(
    private readonly connect: QwpSessionFactory,
    private readonly maxSessions: number,
    private readonly idleTimeoutMs: number,
  ) {}

  /** Leases an idle session, or one opened for this request. */
  async acquire(signal: AbortSignal): Promise<QwpLease> {
    for (;;) {
      if (signal.aborted) throw abortError()
      const entry = this.takeIdle()
      if (entry) return this.lease(entry)
      if (this.size < this.maxSessions)
        return this.lease(await this.open(signal))
      await this.waitForChange(signal)
    }
  }

  /** Opens a session and keeps it idle for the next request. */
  async prewarm(signal: AbortSignal) {
    this.lease(await this.open(signal)).release(true)
  }

  get openSessions() {
    return this.size
  }

  /**
   * Closes every session, and those still leased once they are returned. A
   * session opened for one login must never serve the next one.
   */
  reset() {
    this.generation++
    for (const entry of this.idle.slice()) this.retire(entry)
    this.wake()
  }

  private async open(signal: AbortSignal): Promise<Entry> {
    this.size++
    const generation = this.generation
    let session: QwpEgressSession
    try {
      session = await this.connect(signal)
    } catch (error) {
      this.size--
      this.wake()
      throw error
    }
    const entry: Entry = {
      session,
      generation,
      idle: false,
      closed: false,
      retired: false,
    }
    void session.closed.then(
      () => this.onClosed(entry),
      () => this.onClosed(entry),
    )
    if (generation !== this.generation) {
      this.retire(entry)
      throw abortError()
    }
    // The request gave up while the session opened: keep it for the next.
    if (signal.aborted) {
      this.lease(entry).release(true)
      throw abortError()
    }
    return entry
  }

  private lease(entry: Entry): QwpLease {
    let released = false
    return {
      session: entry.session,
      release: (reusable) => {
        if (released) return
        released = true
        if (!reusable || entry.closed || entry.generation !== this.generation) {
          this.retire(entry)
          return
        }
        entry.idle = true
        entry.idleTimer = setTimeout(
          () => this.retire(entry),
          this.idleTimeoutMs,
        )
        this.idle.push(entry)
        this.wake()
      },
    }
  }

  private takeIdle(): Entry | undefined {
    // The most recently used session is the least likely to have been closed
    // by the server's idle timeout.
    for (let entry = this.idle.pop(); entry; entry = this.idle.pop()) {
      clearTimeout(entry.idleTimer)
      entry.idle = false
      if (!entry.closed && entry.generation === this.generation) return entry
      this.retire(entry)
    }
    return undefined
  }

  private onClosed(entry: Entry) {
    entry.closed = true
    if (entry.idle) this.retire(entry)
  }

  private retire(entry: Entry) {
    if (entry.retired) return
    entry.retired = true
    clearTimeout(entry.idleTimer)
    if (entry.idle) {
      entry.idle = false
      const index = this.idle.indexOf(entry)
      if (index !== -1) this.idle.splice(index, 1)
    }
    this.size--
    void entry.session.close().catch(() => undefined)
    this.wake()
  }

  private wake() {
    const waiters = Array.from(this.waiters)
    this.waiters.clear()
    waiters.forEach((resolve) => resolve())
  }

  private waitForChange(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        this.waiters.delete(wake)
        reject(abortError())
      }
      const wake = () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      }
      this.waiters.add(wake)
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }
}
