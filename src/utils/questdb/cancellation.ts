export const CANCELLED_BY_USER = "Cancelled by user"

export const isCancelledByUser = (error: unknown): boolean =>
  error === CANCELLED_BY_USER ||
  (typeof error === "object" &&
    error !== null &&
    "error" in error &&
    error.error === CANCELLED_BY_USER)
