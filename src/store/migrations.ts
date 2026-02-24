import { db } from "./db"
import type { Buffer } from "./buffers"

export const getCurrentDbVersion = (): number => db.verno

export const migrateBuffer = (
  buffer: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
): Buffer => {
  // eslint-disable-next-line prefer-const -- will be reassigned when migration steps are added
  let migratedBuffer: Record<string, unknown> = buffer

  for (let v = fromVersion; v < toVersion; v++) {
    // Add migration steps here as new versions are introduced.
  }

  return migratedBuffer as Buffer
}
