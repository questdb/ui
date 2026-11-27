#!/usr/bin/env node
// Starts an isolated browser environment for a review or a fix: a QuestDB
// server built from the test/e2e/questdb submodule on free ports, and
// `vite preview` of a built worktree whose proxy points at that server. It
// never touches a QuestDB or a dev server the user already runs (9000, 9999).
//
// Usage:
//   node scripts/review-browser-env.mjs start --app <worktree with dist> --dir <state dir>
//   node scripts/review-browser-env.mjs stop --dir <state dir>
//
// `start` prints, and writes to <dir>/browser-env.sh:
//   QDB_URL=http://127.0.0.1:<port>      the server (for cy.request seeding, curl)
//   PREVIEW_URL=http://127.0.0.1:<port>  pass to Cypress: --config baseUrl=$PREVIEW_URL
//
// The server runs under scripts/with-slots.mjs (weight 2) and holds its slots
// until `stop`. Options:
//   --base-port N   first port to try (default 19100); taken ports are skipped
//   QDB_JAR=<path>  the QuestDB jar, when the submodule build is elsewhere
//   QDB_JAVA=<path> the java binary (default: java on PATH; needs 25 or newer)
import { spawn, spawnSync, execFileSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : fallback
}
const die = (msg) => {
  console.error(`review-browser-env: ${msg}`)
  process.exit(2)
}

const dir = opt("dir")
if (!dir) die("--dir is required")
const pidFile = (name) => path.join(dir, `${name}.pid`)

const terminateGroup = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 1) return
  try {
    process.kill(-pid, "SIGTERM")
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}

const killGroup = (name) => {
  if (!fs.existsSync(pidFile(name))) return
  terminateGroup(Number(fs.readFileSync(pidFile(name), "utf8")))
  fs.rmSync(pidFile(name), { force: true })
}

if (cmd === "stop") {
  killGroup("preview")
  killGroup("questdb")
  console.log("review-browser-env: stopped")
  process.exit(0)
}
if (cmd !== "start") die("usage: start --app <worktree> --dir <dir> | stop --dir <dir>")

const app = path.resolve(opt("app") ?? die("--app is required"))
if (!fs.existsSync(path.join(app, "dist", "index.html")))
  die(`${app}/dist/index.html is missing: build the worktree first`)
fs.mkdirSync(dir, { recursive: true })
if (["preview", "questdb"].some((name) => fs.existsSync(pidFile(name))))
  die(`${dir} already has PID files; stop that environment or use a new directory`)

// The jar: QDB_JAR, else the submodule build of the app, this repository, or
// the main worktree (linked worktrees do not check the submodule out).
const git = (args, cwd) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}
const mainWorktree = (() => {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], app)
  return common ? path.dirname(common) : ""
})()
const jarIn = (root) => {
  const target = path.join(root, "test/e2e/questdb/core/target")
  if (!fs.existsSync(target)) return null
  const jar = fs
    .readdirSync(target)
    .filter((f) => /^questdb-.*\.jar$/.test(f) && !f.includes("-tests"))
    .sort()
    .pop()
  return jar ? path.join(target, jar) : null
}
const jar =
  process.env.QDB_JAR ||
  [app, path.resolve(here, ".."), mainWorktree].filter(Boolean).map(jarIn).find(Boolean)
if (!jar || !fs.existsSync(jar))
  die(
    "no QuestDB jar. In the main checkout run\n" +
      "  git submodule update --init test/e2e/questdb\n" +
      "  node scripts/with-slots.mjs 4 -- mvn clean package -f test/e2e/questdb/pom.xml -DskipTests\n" +
      "or set QDB_JAR.",
  )

const java = process.env.QDB_JAVA || "java"
// `java -version` writes to stderr.
const javaVersion = (() => {
  const r = spawnSync(java, ["-version"], { encoding: "utf8" })
  return `${r.stdout ?? ""}${r.stderr ?? ""}`
})()
const major = Number((javaVersion.match(/version "(\d+)/) || [])[1])
if (!(major >= 25)) die(`QuestDB needs Java 25 or newer; ${java} is ${major || "missing"}. Set QDB_JAVA.`)

// Free ports: a port counts as free only if nothing listens on it on any
// address (the user's server binds *:9000).
const isFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.once("error", () => resolve(false))
    s.listen({ port, host: "0.0.0.0", exclusive: true }, () => s.close(() => resolve(true)))
  })
const freePorts = async (from, count) => {
  const ports = []
  for (let p = from; ports.length < count && p < from + 500; p++) if (await isFree(p)) ports.push(p)
  if (ports.length < count) die(`no ${count} free ports from ${from}`)
  return ports
}
const [httpPort, minPort, pgPort, ilpPort, previewPort] = await freePorts(
  Number(opt("base-port", "19100")),
  5,
)

const root = path.join(dir, "qdb-root")
fs.mkdirSync(path.join(root, "conf"), { recursive: true })
fs.writeFileSync(
  path.join(root, "conf/server.conf"),
  [
    `http.bind.to=127.0.0.1:${httpPort}`,
    `http.min.net.bind.to=127.0.0.1:${minPort}`,
    `pg.net.bind.to=127.0.0.1:${pgPort}`,
    `line.tcp.net.bind.to=127.0.0.1:${ilpPort}`,
    "line.udp.enabled=false",
    "telemetry.enabled=false",
    "",
  ].join("\n"),
)

const questdbArgs = [
  path.join(here, "with-slots.mjs"),
  "2",
  "--",
  java,
  "-Xmx1g",
  "-ea",
  "-Dnoebug",
  "--sun-misc-unsafe-memory-access=allow",
  "--enable-native-access=io.questdb",
  "--add-opens=java.base/java.lang=io.questdb",
  "--add-opens=java.base/java.lang.reflect=io.questdb",
  "--add-opens=java.base/java.nio=io.questdb",
  "--add-opens=java.base/java.time.zone=io.questdb",
  "--add-exports=java.base/jdk.internal.vm=io.questdb",
  ...(process.platform === "darwin" ? ["-XX:-MaxFDLimit"] : []),
  "-p",
  jar,
  "-m",
  "io.questdb/io.questdb.ServerMain",
  "-d",
  root,
]

// The preview proxies the same paths as vite.config.mts, to this server.
const viteConfig = fs.readFileSync(path.join(app, "vite.config.mts"), "utf8")
const proxyBlock = viteConfig.slice(viteConfig.indexOf("proxySettings"))
const proxyPaths = [...proxyBlock.matchAll(/['"](\/[A-Za-z0-9_/-]+)['"]\s*:\s*\{\s*target:/g)].map((m) => m[1])
if (!proxyPaths.includes("/exec"))
  die("could not find the /exec proxy in vite.config.mts")
const previewConfig = path.join(dir, "vite-preview.config.mjs")
fs.writeFileSync(
  previewConfig,
  `const p = { target: "http://127.0.0.1:${httpPort}", changeOrigin: true }
export default {
  root: ${JSON.stringify(app)},
  base: "./",
  build: { outDir: "dist" },
  preview: {
    host: "127.0.0.1",
    port: ${previewPort},
    strictPort: true,
    proxy: { ${proxyPaths.map((p) => `${JSON.stringify(p)}: p`).join(", ")} },
  },
}
`,
)
const vite = [path.join(app, "node_modules/.bin/vite"), path.resolve(here, "../node_modules/.bin/vite")].find(
  fs.existsSync,
)
if (!vite) die("vite not found: install or link node_modules in the worktree")
const preflight = (command, args, label) => {
  const result = spawnSync(command, args, { cwd: app, encoding: "utf8", timeout: 15_000 })
  if (result.status !== 0) die(`${label}: ${result.error?.message || result.stderr.trim()}`)
}
preflight(process.execPath, ["--check", path.resolve(previewConfig)], "invalid preview config")
preflight(vite, ["--version"], "Vite could not start")

const startup = new AbortController()
const cancel = () => startup.abort()
const signals = ["SIGINT", "SIGTERM", "SIGHUP"]
const started = []

const startDetached = async (name, command, args, opts = {}) => {
  startup.signal.throwIfAborted()
  const out = fs.openSync(path.join(dir, `${name}.log`), "a")
  let child
  try {
    child = spawn(command, args, { ...opts, detached: true, stdio: ["ignore", out, out] })
  } finally {
    fs.closeSync(out)
  }
  const exited = new Promise((resolve) => {
    child.once("exit", resolve)
    child.once("error", resolve)
  })
  started.push({ name, child, exited })
  await once(child, "spawn")
  fs.writeFileSync(pidFile(name), String(child.pid))
  return child
}

const waitFor = async (url, label, seconds, child) => {
  const start = Date.now()
  let nextNotice = 30_000
  while (Date.now() - start < seconds * 1000) {
    startup.signal.throwIfAborted()
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${label} exited during startup; see ${dir}/${label}.log`)
    try {
      const signal = AbortSignal.any([startup.signal, AbortSignal.timeout(1000)])
      const r = await fetch(url, { signal })
      if (r.ok) return
    } catch {}
    const elapsed = Date.now() - start
    if (elapsed >= nextNotice) {
      console.log(`review-browser-env: waiting for ${label} (${Math.floor(elapsed / 1000)}s; slots may be busy)`)
      nextNotice = elapsed + 30_000
    }
    await delay(1000, undefined, { signal: startup.signal })
  }
  throw new Error(`${label} did not answer ${url} within ${seconds}s; see ${dir}/${label}.log`)
}

const envFile = path.join(dir, "browser-env.sh")
const QDB_URL = `http://127.0.0.1:${httpPort}`
const PREVIEW_URL = `http://127.0.0.1:${previewPort}`
for (const signal of signals) process.on(signal, cancel)
try {
  const questdb = await startDetached("questdb", process.execPath, questdbArgs, {
    env: { ...process.env, QDB_SLOTS_HELD: "0" },
  })
  await waitFor(`${QDB_URL}/exec?query=select%201`, "questdb", 900, questdb)
  const preview = await startDetached("preview", vite, ["preview", "--config", path.resolve(previewConfig)], { cwd: app })
  await waitFor(`${PREVIEW_URL}/exec?query=select%201`, "preview", 120, preview)
  startup.signal.throwIfAborted()
  const env = `export QDB_URL=${QDB_URL} PREVIEW_URL=${PREVIEW_URL} QDB_JAR='${jar.replaceAll("'", "'\\''")}'\n`
  fs.writeFileSync(envFile, env)
  for (const { child } of started) child.unref()
  console.log(env.trim().replace(/^export /, ""))
  console.log(`stop with: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} stop --dir ${dir}`)
} catch (error) {
  // The QuestDB wrapper forwards TERM to Java and releases its slot on exit.
  for (const { child } of [...started].reverse()) terminateGroup(child.pid)
  for (const { name, exited } of started) {
    await exited
    fs.rmSync(pidFile(name), { force: true })
  }
  fs.rmSync(envFile, { force: true })
  console.error(`review-browser-env: ${error.message}`)
  process.exitCode = 2
} finally {
  for (const signal of signals) process.off(signal, cancel)
}
