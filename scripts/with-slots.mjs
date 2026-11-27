#!/usr/bin/env node
// Runs a command inside one system-wide memory budget shared by every review,
// repo and worktree on this machine, so heavy jobs (Vitest, tsc, eslint, vite
// build, Cypress) never stack up past the RAM the box has.
//
// Usage:
//   node scripts/with-slots.mjs <weight> -- <command> [args...]
//
// The budget is 9 units of about 1 GB each (QDB_SLOTS_TOTAL overrides it),
// kept in QDB_SLOTS_DIR, else /tmp/qdb-slots. A job waits until its weight
// fits; waiting never fails and never ends in a forced run, unless
// QDB_SLOTS_MAX_WAIT_MS is set above 0 (time the host was paused does not
// count). The command runs in its own process group, and its slot is held
// while that group lives, even if this wrapper dies. A command already
// inside the budget (QDB_SLOTS_HELD=1) runs at once, without taking slots.
// A Vite or Vitest job gets 1 unit more while vite.config.mts starts
// vite-plugin-checker without a process.env.VITEST guard.

import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TOTAL = Number(process.env.QDB_SLOTS_TOTAL ?? 9)
const MAX_WAIT_MS = Number(process.env.QDB_SLOTS_MAX_WAIT_MS ?? 0)
const POLL_MS = 3_000
const HOLDERS_NOTICE_MS = 5 * 60_000
const STALE_LOCK_MS = 30_000
const DIR = process.env.QDB_SLOTS_DIR ?? "/tmp/qdb-slots"
const LOCK = path.join(DIR, ".lock")
const LOCK_PID = path.join(LOCK, "pid")

const usage = () => {
  console.error("usage: node scripts/with-slots.mjs <weight> -- <command> [args...]")
  process.exit(2)
}

const separator = process.argv.indexOf("--")
const requestedWeight = Number(process.argv[2])
const command = separator > 0 ? process.argv.slice(separator + 1) : []
if (!Number.isFinite(requestedWeight) || requestedWeight < 0 || command.length === 0)
  usage()

const exitCode = (code, signal) =>
  signal ? 128 + (os.constants.signals[signal] ?? 0) : (code ?? 1)

const runChild = (options, beforeExit = () => {}) => {
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", ...options })
  child.on("error", (error) => {
    beforeExit()
    console.error(`with-slots: ${error.message}`)
    process.exit(127)
  })
  child.on("exit", (code, signal) => {
    beforeExit()
    process.exit(exitCode(code, signal))
  })
  return child
}

// Nested call: the job that started it already holds the slots.
if (process.env.QDB_SLOTS_HELD === "1") {
  const child = runChild({})
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal))
  process.on("SIGHUP", () => {})
} else {
  await runInBudget()
}

async function runInBudget() {
  const checkerExtra = () => {
    const viteJob = command.some(
      (arg) => /(^|\/)(vitest|vite)$/.test(arg) || arg === "build",
    )
    if (!viteJob || command.includes("preview")) return 0
    let config = ""
    try {
      config = fs.readFileSync("vite.config.mts", "utf8")
    } catch {
      return 0
    }
    return /checker\(/.test(config) && !/process\.env\.VITEST/.test(config) ? 1 : 0
  }
  const extra = checkerExtra()
  const weight = requestedWeight + extra
  if (extra > 0)
    console.error(
      `with-slots: +1 for vite-plugin-checker (vite.config.mts has no process.env.VITEST guard): weight ${weight}`,
    )

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const isAlive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error.code === "EPERM"
    }
  }

  const writeAtomic = (file, text) => {
    const temporary = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, text)
    fs.renameSync(temporary, file)
  }

  const readLockPid = () => {
    try {
      return Number(fs.readFileSync(LOCK_PID, "utf8"))
    } catch {
      return undefined
    }
  }

  // A lock is stale only when its owner is dead, or when it has no pid file
  // 30 s after it was made (its owner died between mkdir and writing it).
  const lockIsStale = () => {
    const pid = readLockPid()
    if (pid) return !isAlive(pid)
    try {
      return Date.now() - fs.statSync(LOCK).mtimeMs > STALE_LOCK_MS
    } catch {
      return false
    }
  }

  // Breaking a stale lock is itself serialized, so two waiters never both
  // remove it and one of them a lock the other has just taken.
  const breakStaleLock = () => {
    const breaker = `${LOCK}.break`
    try {
      fs.mkdirSync(breaker)
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      try {
        if (Date.now() - fs.statSync(breaker).mtimeMs > STALE_LOCK_MS)
          fs.rmSync(breaker, { recursive: true, force: true })
      } catch {
        // Another waiter removed it.
      }
      return
    }
    try {
      if (lockIsStale()) fs.rmSync(LOCK, { recursive: true, force: true })
    } finally {
      fs.rmSync(breaker, { recursive: true, force: true })
    }
  }

  const withLock = async (fn) => {
    for (;;) {
      try {
        fs.mkdirSync(LOCK)
        writeAtomic(LOCK_PID, String(process.pid))
        break
      } catch (error) {
        if (error.code !== "EEXIST") throw error
        if (lockIsStale()) breakStaleLock()
        await sleep(100)
      }
    }
    try {
      return fn()
    } finally {
      if (readLockPid() === process.pid) fs.rmSync(LOCK, { recursive: true, force: true })
    }
  }

  const readHolders = () => {
    const holders = []
    for (const name of fs.readdirSync(DIR)) {
      if (!name.endsWith(".json")) continue
      const file = path.join(DIR, name)
      try {
        holders.push({ file, ...JSON.parse(fs.readFileSync(file, "utf8")) })
      } catch {
        fs.rmSync(file, { force: true })
      }
    }
    return holders
  }

  // A holder is live while its wrapper or its command's process group lives.
  const holderIsAlive = (holder) =>
    isAlive(holder.pid) || (holder.pgid !== undefined && isAlive(-holder.pgid))

  // The weight held by live jobs; files of dead ones are removed.
  const heldWeight = () => {
    let used = 0
    for (const holder of readHolders()) {
      if (holderIsAlive(holder)) used += holder.weight
      else fs.rmSync(holder.file, { force: true })
    }
    return used
  }

  const printHolders = () => {
    for (const holder of readHolders())
      console.error(
        `with-slots:   holds ${holder.weight} since ${holder.since}: ${holder.command} (in ${holder.cwd})`,
      )
  }

  fs.mkdirSync(DIR, { recursive: true })
  try {
    fs.chmodSync(DIR, 0o1777)
  } catch {
    // Another user made it; its mode is theirs to set.
  }

  const ticket = path.join(DIR, `${process.pid}.json`)
  const holder = {
    pid: process.pid,
    weight,
    command: command.join(" "),
    cwd: process.cwd(),
    since: new Date().toISOString(),
  }
  const release = () => fs.rmSync(ticket, { force: true })

  const acquire = async () => {
    let waited = 0
    let last = Date.now()
    let lastNotice
    for (;;) {
      const taken = await withLock(() => {
        const used = heldWeight()
        // A job heavier than the whole budget runs alone.
        const fits = used + weight <= TOTAL || (used === 0 && weight > TOTAL)
        const waitedTooLong = MAX_WAIT_MS > 0 && waited >= MAX_WAIT_MS
        if (!fits && !waitedTooLong) return { used }
        holder.since = new Date().toISOString()
        writeAtomic(ticket, JSON.stringify(holder))
        return { used, forced: !fits }
      })
      if (taken.forced !== undefined) {
        if (taken.forced)
          console.error(
            `with-slots: waited ${Math.round(MAX_WAIT_MS / 60_000)} min; running anyway (${taken.used}/${TOTAL} in use)`,
          )
        return
      }
      if (lastNotice === undefined || Date.now() - lastNotice >= HOLDERS_NOTICE_MS) {
        console.error(
          `with-slots: waiting for a free slot (normal, do not cancel): needs ${weight}, ${taken.used}/${TOTAL} in use by:`,
        )
        printHolders()
        lastNotice = Date.now()
      }
      await sleep(POLL_MS)
      // A host pause counts as two polls at most.
      const now = Date.now()
      waited += Math.min(now - last, 2 * POLL_MS)
      last = now
    }
  }

  await acquire()

  const child = runChild(
    { detached: true, env: { ...process.env, QDB_SLOTS_HELD: "1" } },
    release,
  )
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      try {
        process.kill(-child.pid, signal)
      } catch {
        // The group is gone.
      }
    })
  // Keep running when the session goes away: the intent of nohup.
  process.on("SIGHUP", () => {})
  if (child.pid !== undefined) {
    holder.pgid = child.pid
    await withLock(() => writeAtomic(ticket, JSON.stringify(holder)))
  }
}
