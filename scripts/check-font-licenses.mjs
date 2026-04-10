/**
 * Checks that every font directory contains a LICENSE file.
 * Exits with code 1 if any are missing.
 */

import { readdirSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

const FONT_DIRS = ["src/styles/fonts", "public/fonts"]
const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot"])

let failed = false

for (const dir of FONT_DIRS) {
  const fullPath = resolve(root, dir)
  if (!existsSync(fullPath)) continue

  const fonts = readdirSync(fullPath).filter((f) =>
    FONT_EXTENSIONS.has(f.slice(f.lastIndexOf("."))),
  )
  if (fonts.length === 0) continue

  const licenseFile = resolve(fullPath, "LICENSE")
  if (!existsSync(licenseFile)) {
    console.error(`Missing LICENSE file in ${dir} for fonts:`)
    for (const f of fonts) {
      console.error(`  - ${f}`)
    }
    failed = true
  } else {
    console.log(`OK: ${dir}/LICENSE`)
  }
}

if (failed) {
  console.error(
    "\nEvery font directory must include a LICENSE file for redistribution compliance.",
  )
  process.exit(1)
}

console.log("\nAll font directories have LICENSE files.")
