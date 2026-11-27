// Single publisher, cycle-local cache. Stdout is only the selected artifact path.
// <absolute cache> <ui|jar> <full SHA> <profile> [-- <producer> ... | --reuse <jar>]
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { constants } from "node:os"
import path from "node:path"

const [root, kind, sha, profile, mode, ...args] = process.argv.slice(2)
const die = (message) => {
  console.error(`review-build-cache: ${message}`)
  process.exit(2)
}
if (
  !root ||
  !path.isAbsolute(root) ||
  !["ui", "jar"].includes(kind) ||
  !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha) ||
  !profile ||
  !(
    mode === undefined ||
    (mode === "--" && args.length > 0) ||
    (kind === "jar" && mode === "--reuse" && args.length === 1)
  )
) {
  die(
    "usage: <absolute cache> <ui|jar> <full SHA> <profile> [-- <producer> ... | --reuse <jar>]",
  )
}

const ui = kind === "ui"
const uiEnv =
  /^(?:VITE(?:_|ST$)|NODE_|YARN_|COREPACK_|NPM_|BROWSERSLIST|TEST_SUITE$|QDB_HTTP_CONTEXT_WEB_CONSOLE$)/i
const jarEnv =
  /^(?:JAVA_|JDK_|_JAVA_|MAVEN_|M2_|CARGO_|RUST|CC$|CXX$|CFLAGS$|CXXFLAGS$|LDFLAGS$)/
const inputs = Object.keys(process.env)
  .sort()
  .filter(
    (key) =>
      /^(?:HOME|PATH|CI|LANG|TZ|LC_.*)$/.test(key) ||
      (ui ? uiEnv : jarEnv).test(key),
  )
  .map((key) => [key, process.env[key]])
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify([
      profile,
      process.platform,
      process.arch,
      ui ? process.version : null,
      inputs,
    ]),
  )
  .digest("hex")
const entry = path.join(root, kind, sha, fingerprint)
const name = ui ? "dist" : "questdb.jar"
const artifact = path.join(entry, name)

const git = (...argv) => {
  const result = spawnSync("git", argv, { encoding: "utf8" })
  if (result.status !== 0) die(result.error?.message ?? result.stderr.trim())
  return result.stdout.trim()
}
// The standard Vite recipe uses production mode and the checkout's envDir.
// Ignored local files do not appear in git status but still affect builds.
const checkUiEnv = () => {
  if (!ui) return
  const files = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]
  for (const file of files) {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (stat && (!stat.isFile() || !git("ls-files", "--", file)))
      die(`unexpected local Vite env input: ${file}`)
  }
  if (git("diff", "--name-only", sha, "--", ...files))
    die("Vite env files differ from the requested SHA")
}
const clean = () => {
  if (
    git("rev-parse", "HEAD") !== sha ||
    git(
      "status",
      "--porcelain",
      "--ignore-submodules=none",
      "--untracked-files=all",
    )
  ) {
    die("producer needs a clean scratch checkout of the exact SHA")
  }
}
const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile()
const valid = (file) => {
  if (ui)
    return (
      fs.lstatSync(file, { throwIfNoEntry: false })?.isDirectory() &&
      isFile(path.join(file, "index.html"))
    )
  if (!isFile(file)) return false
  const jar = path.resolve(file)
  const manifest = spawnSync("unzip", ["-p", jar, "META-INF/MANIFEST.MF"], {
    encoding: "utf8",
  })
  if (manifest.status !== 0) return false
  const revisions = manifest.stdout
    .replace(/\r?\n /g, "")
    .split(/\r?\n\r?\n/, 1)[0]
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Build-Commit-Hash:"))
  return (
    revisions.length === 1 &&
    revisions[0] === `Build-Commit-Hash: ${sha}` &&
    spawnSync("unzip", ["-Z1", jar, "io/questdb/ServerMain.class"], {
      stdio: "ignore",
    }).status === 0
  )
}

checkUiEnv()
if (fs.existsSync(entry)) {
  if (!valid(artifact)) die(`invalid completed entry: ${entry}`)
  console.error(`review-build-cache: hit ${kind} ${sha}`)
  console.log(artifact)
  process.exit(0)
}
if (!mode) process.exit(1) // Lookup only: a missing completed entry.

let source
if (mode === "--reuse") {
  // Caller has independent provenance for this exact clean build/profile.
  source = args[0]
} else {
  clean()
  if (ui) {
    if (git("ls-files", "--", "dist")) die("dist is tracked")
    fs.rmSync("dist", { recursive: true, force: true })
  }
  const [command, ...argv] = args
  const result = spawnSync(command, argv, { stdio: ["inherit", 2, 2] })
  if (result.error) console.error(`review-build-cache: ${result.error.message}`)
  if (result.status !== 0)
    process.exit(
      result.status ??
        (result.signal ? 128 + constants.signals[result.signal] : 127),
    )
  clean()
  checkUiEnv()
  if (ui) source = "dist"
  else {
    const target = "core/target"
    const candidates = fs
      .readdirSync(target)
      .filter((file) => /^questdb-\d.*\.jar$/.test(file))
      .map((file) => path.join(target, file))
      .filter(valid)
    if (candidates.length !== 1)
      die(`expected one runnable JAR for ${sha}, found ${candidates.length}`)
    source = candidates[0]
  }
}
if (!valid(source))
  die(`producer did not supply a valid ${kind} artifact for ${sha}`)

// Copy, never link to a scratch worktree. The final path appears in one rename.
const parent = path.dirname(entry)
fs.mkdirSync(parent, { recursive: true })
const stage = fs.mkdtempSync(path.join(parent, ".partial-"))
try {
  fs.cpSync(source, path.join(stage, name), {
    recursive: ui,
    dereference: true,
  })
  if (!valid(path.join(stage, name)))
    die(`invalid staged ${kind} artifact for ${sha}`)
  fs.renameSync(stage, entry)
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
console.log(artifact)
