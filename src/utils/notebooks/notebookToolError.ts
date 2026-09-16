export type NotebookToolErrorCode =
  | "unknown_buffer"
  | "deleted"
  | "archived"
  | "not_a_notebook"
  | "activation_failed"
  | "unknown_cell"
  | "workspace_unavailable"
  | "mounted_mid_edit"
  | "last_tab"
  | "last_cell"
  | "cell_limit"
  | "cell_too_large"

export class NotebookToolError extends Error {
  readonly code: NotebookToolErrorCode
  constructor(code: NotebookToolErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "NotebookToolError"
  }
}

// User-facing actions must never throw into a click handler. Transitions throw
// NotebookToolError on invalid state (already prevented by UI guards like
// showDelete), so wrap those calls: swallow the typed error, re-raise anything
// unexpected. The agent route does NOT use this — the model needs the error.
export const silently = <T>(run: () => T): T | undefined => {
  try {
    return run()
  } catch (error) {
    if (error instanceof NotebookToolError) return undefined
    throw error
  }
}
