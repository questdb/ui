import type { ModelToolsClient } from "../aiAssistant"
import { dispatchTool } from "../tools/dispatch"
import { formatDigest, sanitizeForPromptContext } from "../ai/notebookSnapshot"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import {
  resolveGetRecentUserActions,
  resolveGetWorkspaceState,
  type MetaToolContext,
} from "./metaResolvers"
import { DEFAULT_GRANTED, type Permissions } from "../tools/permissions"
import type { ToolCallMessage, ToolContent, ToolResultPayload } from "./types"
import type { ValidateQueryResult } from "../questdb/types"
import { isMcpMetaToolName, mutatesNotebook } from "../tools/tools"

export type StateFreshness = "unfetched" | "fresh" | "stale"

export type FreshnessGate = {
  get: () => StateFreshness
  set: (next: StateFreshness) => void
  getReadBuffer: () => number | null
  setReadBuffer: (bufferId: number | null) => void
}

export type PermissionsRefs = {
  get: () => Permissions
  // True when permissions changed since the last dispatch; the wrapper
  // prepends a notice on the next call so the model learns mid-session.
  consumeDirty: () => boolean
}

export type DispatchContext = {
  modelToolsClient: ModelToolsClient
  freshness: FreshnessGate
  metaToolContext: MetaToolContext
  permissions?: PermissionsRefs
  validateSql?: (sql: string) => Promise<ValidateQueryResult>
  signal?: AbortSignal
}

const FULL_STATE_READ_TOOLS = new Set<string>(["get_notebook_state"])

const STATE_NOT_FETCHED_MESSAGE =
  "STATE_NOT_FETCHED: Call get_workspace_state first to see the current " +
  "notebook layout, cells, and any user edits. Then retry this tool."

const STATE_STALE_MESSAGE =
  "STATE_STALE: The user changed the notebook since your last fetch. Call " +
  "get_workspace_state to re-sync, then retry this tool."

const STATE_WRONG_BUFFER_MESSAGE =
  "STATE_NOT_FETCHED: Your last full read was of a different notebook. Call " +
  "get_notebook_state for this buffer_id to see its current cells and any " +
  "user edits, then retry this tool."

const bufferIdOf = (args: unknown): number | null => {
  const id = (args as { buffer_id?: unknown } | null | undefined)?.buffer_id
  return typeof id === "number" ? id : null
}

const errorPayload = (text: string): ToolResultPayload => ({
  content: [{ type: "text", text }],
  isError: true,
})

const wrapDispatchToolOutput = (out: {
  content: string
  is_error?: boolean
}): ToolResultPayload => ({
  content: [{ type: "text", text: out.content }],
  isError: out.is_error === true ? true : false,
})

// Includes active_buffer even on a "no events" call so the agent
// notices a tab switch without needing a per-cell event.
const buildSinceLastCheckBlock = (
  meta: MetaToolContext,
  digest: UserActionDigest | null,
): string => {
  const parts: string[] = []
  const ws = meta.getWorkspace()
  if (ws?.active) {
    const label = sanitizeForPromptContext(ws.active.label)
    parts.push(
      `  active_buffer: { id: ${ws.active.buffer_id}, label: ${JSON.stringify(label)}, kind: ${ws.active.kind} }`,
    )
  }
  if (digest) {
    const text = formatDigest(digest)
    if (text) {
      // Strip formatDigest's own <user_events> wrapper so the outer
      // <since_last_check> stays single-rooted.
      const inner = text
        .split("\n")
        .filter((line) => !/^<\/?user_events/.test(line.trim()))
        .map((line) => "  " + line.replace(/^\s*/, ""))
      parts.push(...inner)
    }
  }
  if (parts.length === 0) return ""
  return [`<since_last_check>`, ...parts, `</since_last_check>`].join("\n")
}

const appendSinceLastCheck = (
  payload: ToolResultPayload,
  block: string,
): ToolResultPayload => {
  if (!block) return payload
  const content: ToolContent[] = payload.content.map((c) => ({ ...c }))
  if (content.length === 0) {
    content.push({ type: "text", text: block })
  } else {
    const last = content[content.length - 1]
    if (last.type === "text") {
      last.text = `${last.text}\n\n${block}`
    } else {
      content.push({ type: "text", text: block })
    }
  }
  return { ...payload, content }
}

const noopSetStatus = () => undefined

// These tools already emit user-events themselves; skip the suffix.
const DIGEST_OWNING_TOOLS = new Set<string>([
  "get_workspace_state",
  "get_recent_user_actions",
])

const buildPermissionsUpdatedBlock = (perms: Permissions): string =>
  `[Permissions updated since last call: read=${perms.read}, write=${perms.write}. ` +
  `Operations not covered will be refused with PERMISSION_DENIED.]`

const prependPermissionsNotice = (
  payload: ToolResultPayload,
  notice: string,
): ToolResultPayload => {
  if (!notice) return payload
  const content: ToolContent[] = payload.content.map((c) => ({ ...c }))
  if (content.length === 0 || content[0].type !== "text") {
    content.unshift({ type: "text", text: notice })
  } else {
    content[0] = { ...content[0], text: `${notice}\n\n${content[0].text}` }
  }
  return { ...payload, content }
}

export const dispatchMCPTool = async (
  call: ToolCallMessage,
  ctx: DispatchContext,
): Promise<ToolResultPayload> => {
  const result = await dispatchInner(call, ctx)
  // Suppress dirty-notice on a denial — the deny reason already names
  // the missing permission.
  const dirty = ctx.permissions?.consumeDirty() ?? false
  const withPermsNotice =
    dirty && ctx.permissions && !result.isError
      ? prependPermissionsNotice(
          result,
          buildPermissionsUpdatedBlock(ctx.permissions.get()),
        )
      : result

  if (DIGEST_OWNING_TOOLS.has(call.name)) return withPermsNotice

  const digest = ctx.metaToolContext.consumeDigest
    ? ctx.metaToolContext.consumeDigest()
    : ctx.metaToolContext.getDigest()
  const block = buildSinceLastCheckBlock(ctx.metaToolContext, digest)
  return appendSinceLastCheck(withPermsNotice, block)
}

const dispatchInner = async (
  call: ToolCallMessage,
  ctx: DispatchContext,
): Promise<ToolResultPayload> => {
  if (isMcpMetaToolName(call.name)) {
    if (call.name === "get_workspace_state") {
      const content = resolveGetWorkspaceState(
        call.arguments as { include_user_events?: boolean } | undefined,
        ctx.metaToolContext,
      )
      const activeId = ctx.metaToolContext.getActiveBufferId()
      if (activeId !== null) {
        ctx.freshness.set("fresh")
        ctx.freshness.setReadBuffer(activeId)
      }
      return { content, isError: false }
    }
    // get_recent_user_actions returns only a digest of action IDs (no cell
    // values), so it is NOT a full re-sync and must not clear "stale" — else a
    // later apply_notebook_state could overwrite the unseen edit it just named.
    return {
      content: resolveGetRecentUserActions(ctx.metaToolContext),
      isError: false,
    }
  }

  // Mutations gate on freshness; the deny text is the recovery instruction.
  // create_notebook is exempt: it makes a NEW notebook, so there is no existing
  // buffer whose unseen user edit it could overwrite
  if (mutatesNotebook(call.name) && call.name !== "create_notebook") {
    const flag = ctx.freshness.get()
    if (flag === "unfetched") return errorPayload(STATE_NOT_FETCHED_MESSAGE)
    if (flag === "stale") return errorPayload(STATE_STALE_MESSAGE)
    const target = bufferIdOf(call.arguments)
    if (target !== null && ctx.freshness.getReadBuffer() !== target) {
      return errorPayload(STATE_WRONG_BUFFER_MESSAGE)
    }
  }

  const perms = ctx.permissions
    ? (ctx.permissions.get() ?? DEFAULT_GRANTED)
    : undefined
  const out = await dispatchTool(
    call.name,
    call.arguments,
    ctx.modelToolsClient,
    noopSetStatus,
    perms,
    ctx.validateSql,
    ctx.signal,
  )
  if (FULL_STATE_READ_TOOLS.has(call.name) && !out.is_error) {
    ctx.freshness.set("fresh")
    ctx.freshness.setReadBuffer(bufferIdOf(call.arguments))
  }
  return wrapDispatchToolOutput(out)
}
