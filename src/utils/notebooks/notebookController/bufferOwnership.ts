// One record of who owns a notebook buffer and whether that ownership changed.
// `mode` is the live-side claim (mounting or mounted); absent means unclaimed.
// `epoch` is a per-buffer monotonic mount-session id, bumped on every claim and
// kept across release so a headless run that straddles a mount is still caught.
// This unifies what were three maps — bufferModes, mountingTokens, and
// bufferMountEpochs — into a single answer to "who holds this buffer, and has a
// newer session taken it since I looked".

export type NotebookBufferMode = "mounting" | "live"

type OwnershipRecord = { epoch: number; mode?: NotebookBufferMode }

const records = new Map<number, OwnershipRecord>()

const epochOf = (bufferId: number): number => records.get(bufferId)?.epoch ?? 0

export const claimMounting = (bufferId: number): number => {
  const epoch = epochOf(bufferId) + 1
  records.set(bufferId, { epoch, mode: "mounting" })
  return epoch
}

export const claimLive = (bufferId: number): void => {
  const rec = records.get(bufferId)
  const epoch = rec?.mode === undefined ? epochOf(bufferId) + 1 : rec.epoch
  records.set(bufferId, { epoch, mode: "live" })
}

export const releaseMounting = (bufferId: number): boolean => {
  const rec = records.get(bufferId)
  if (rec?.mode !== "mounting") return false
  records.set(bufferId, { epoch: rec.epoch })
  return true
}

export const releaseLive = (bufferId: number): boolean => {
  const rec = records.get(bufferId)
  if (rec?.mode !== "live") return false
  records.set(bufferId, { epoch: rec.epoch })
  return true
}

export const forgetBufferOwnership = (bufferId: number): void => {
  records.delete(bufferId)
}

// Bumps the epoch and drops any mode claim WITHOUT deleting the record, so a
// later claim (e.g. a history restore of an archived buffer) climbs strictly
// above this epoch.
export const releaseBufferEpoch = (bufferId: number): void => {
  records.set(bufferId, { epoch: epochOf(bufferId) + 1 })
}

export const getBufferMode = (
  bufferId: number,
): NotebookBufferMode | undefined => records.get(bufferId)?.mode

export const isBufferClaimed = (bufferId: number): boolean =>
  records.get(bufferId)?.mode !== undefined

export const getMountEpoch = (bufferId: number): number => epochOf(bufferId)

export const __resetBufferOwnershipForTests = (): void => {
  records.clear()
}
