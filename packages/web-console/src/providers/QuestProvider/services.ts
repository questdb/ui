import { Versions } from "./types"

const buildVersionRegex =
  /Build Information: QuestDB ([\w- ]+ )?([0-9A-Za-z.-]*),/

export const formatVersion = (value: string): Versions => {
  const matches = buildVersionRegex.exec(value.toString())

  if (matches) {
    const kind = (
      matches[1] ? matches[1].trim().toLowerCase() : "oss"
    ) as Versions["type"]

    return {
      type: kind,
      version: matches[2],
    }
  }

  return {
    type: "dev",
  }
}

const commitHashRegex = /Commit Hash ([0-9A-Za-z]*)/

export const formatCommitHash = (value: string | number | boolean) => {
  const matches = commitHashRegex.exec(value.toString())

  return matches ? matches[1] : ""
}
