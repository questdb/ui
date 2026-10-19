import { formatTiming } from "../../../utils/formatTiming"

export const formatScriptSummary = ({
  successful,
  failed,
  total,
  duration,
}: {
  successful: number
  failed: number
  total: number
  duration: number
}): string => {
  const completed = successful + failed
  const prefix =
    total === completed
      ? `Running completed in ${formatTiming(duration)} with `
      : "Stopped after running "
  const counts =
    [
      successful > 0 ? `${successful} successful` : "",
      failed > 0 ? `${failed} failed` : "",
    ]
      .filter(Boolean)
      .join(" and ") || "0"
  return `${prefix}${counts} ${completed === 1 ? "query" : "queries"}`
}
