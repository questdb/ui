import { NotebookToolError } from "./notebookToolError"
import { isAuthFailure } from "../../modules/OAuth2/session"

// Never send error.message: it can contain SQL, table names or returned data.
export const notebookFailureReason = (error: unknown): string => {
  if (error instanceof NotebookToolError) return error.code
  if (isAuthFailure(error)) return "authentication"
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? error.name
      : undefined
  switch (name) {
    case "QuotaExceededError":
      return "storage_quota"
    case "AbortError":
      return "aborted"
    case "DatabaseClosedError":
    case "InvalidStateError":
    case "TransactionInactiveError":
    case "ReadOnlyError":
    case "DataCloneError":
    case "UnknownError":
      return "storage_error"
    default:
      return "unexpected"
  }
}
