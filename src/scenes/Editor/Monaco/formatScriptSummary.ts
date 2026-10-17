import { formatTiming } from "../../../utils/formatTiming"

export const formatScriptSummary = ({
  successful,
  failed,
  total,
  duration,
  sessionEnded,
  outcomeUnknown,
}: {
  successful: number
  failed: number
  total: number
  duration: number
  sessionEnded: boolean
  outcomeUnknown: boolean
}): string => {
  const completed = successful + failed
  const prefix =
    !sessionEnded && total === completed
      ? `Running completed in ${formatTiming(duration)} with `
      : "Stopped after running "
  const counts =
    [
      successful > 0 ? `${successful} successful` : "",
      failed > 0 ? `${failed} failed` : "",
    ]
      .filter(Boolean)
      .join(" and ") || "0"
  const end = !sessionEnded
    ? ""
    : outcomeUnknown
      ? "; session ended. The last statement's outcome is unknown; verify before running again."
      : completed === 0
        ? "; session ended. No statements were sent."
        : "; session ended. No further statements were sent."
  return `${prefix}${counts} ${completed === 1 ? "query" : "queries"}${end}`
}
