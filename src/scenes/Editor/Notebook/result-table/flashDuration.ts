import { DEFAULT_FLASH_DURATION_MS } from "../../../../components/ResultGrid"

const FLASH_SHARE_OF_REFRESH_INTERVAL = 0.8

export const flashDurationFor = (refreshIntervalMs: number | undefined) =>
  refreshIntervalMs === undefined
    ? DEFAULT_FLASH_DURATION_MS
    : Math.min(
        DEFAULT_FLASH_DURATION_MS,
        refreshIntervalMs * FLASH_SHARE_OF_REFRESH_INTERVAL,
      )
