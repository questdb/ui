import type { ModelToolsClient } from "../ai/aiAssistant"
import { dispatchTool } from "../tools/dispatch"
import {
  INVALID_BUFFER_ID_MESSAGE,
  STATE_NOT_FETCHED_MESSAGE,
  STATE_STALE_MESSAGE,
} from "../notebooks/notebookToolMessages"
import { formatDigest } from "../ai/notebookSnapshot"
import { sanitizeForPromptContext } from "../ai/sanitizeForPromptContext"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import {
  resolveGetRecentUserActions,
  resolveGetWorkspaceState,
  type MetaToolContext,
} from "./metaResolvers"
import { DEFAULT_GRANTED, type Permissions } from "../tools/permissions"
import type { ToolCallMessage, ToolContent, ToolResultPayload } from "./types"
import type { ValidateQueryResult } from "../questdb/types"
import {
  createsNotebook,
  isMcpMetaToolName,
  requiresFreshNotebookRead,
} from "../tools/tools"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import {
  captureReadSeq,
  type NotebookFreshness,
} from "../notebooks/notebookFreshness"

export type PermissionsRefs = {
  get: () => Permissions
  // True when permissions changed since the last dispatch; the wrapper
  // prepends a notice on the next call so the model learns mid-session.
  consumeDirty: () => boolean
}

export type DispatchContext = {
  modelToolsClient: ModelToolsClient
  freshness: NotebookFreshness
  metaToolContext: MetaToolContext
  permissions?: PermissionsRefs
  validateSql?: (sql: string) => Promise<ValidateQueryResult>
  signal?: AbortSignal
}

const bufferIdOf = (args: unknown): number | null => {
  const id = (args as { buffer_id?: unknown } | null | undefined)?.buffer_id
  return typeof id === "number" ? id : null
}

const createdBufferIdOf = (content: string): number | null => {
  try {
    const parsed = JSON.parse(content) as { bufferId?: unknown }
    return typeof parsed.bufferId === "number" ? parsed.bufferId : null
  } catch {
    return null
  }
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
    const archived = ws.active.archived ? ", archived: true" : ""
    parts.push(
      `  active_buffer: { id: ${ws.active.buffer_id}, label: ${JSON.stringify(label)}, kind: ${ws.active.kind}${archived} }`,
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
  // Every read below records freshness after an await; the reads are unabortable,
  // so capture the connection generation now and reject a recordRead whose read
  // began before a reconnect reset — otherwise a stale read could seed freshness
  // for a notebook the new connection never saw.
  const readGeneration = ctx.freshness.generation()
  if (isMcpMetaToolName(call.name)) {
    if (call.name === "get_workspace_state") {
      const activeId = ctx.metaToolContext.getActiveBufferId()
      const seqBeforeRead = activeId !== null ? captureReadSeq(activeId) : null
      const content = await resolveGetWorkspaceState(
        call.arguments as { include_user_events?: boolean } | undefined,
        ctx.metaToolContext,
      )
      if (activeId !== null && seqBeforeRead !== null) {
        ctx.freshness.recordRead(activeId, seqBeforeRead, readGeneration)
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

  if (requiresFreshNotebookRead(call.name)) {
    const target = bufferIdOf(call.arguments)
    if (target === null) return errorPayload(INVALID_BUFFER_ID_MESSAGE)
    switch (ctx.freshness.assertFresh(target)) {
      case "not_fetched":
        return errorPayload(STATE_NOT_FETCHED_MESSAGE)
      case "stale":
        return errorPayload(STATE_STALE_MESSAGE)
    }
  }

  const perms = ctx.permissions
    ? (ctx.permissions.get() ?? DEFAULT_GRANTED)
    : undefined
  const fullReadTarget =
    call.name === "get_notebook_state" ? bufferIdOf(call.arguments) : null
  const seqBeforeFullRead =
    fullReadTarget !== null ? captureReadSeq(fullReadTarget) : null
  const out = await dispatchTool(
    call.name,
    call.arguments,
    ctx.modelToolsClient,
    noopSetStatus,
    perms,
    ctx.validateSql,
    ctx.signal,
  )
  if (!out.is_error) {
    if (fullReadTarget !== null && seqBeforeFullRead !== null) {
      ctx.freshness.recordRead(
        fullReadTarget,
        seqBeforeFullRead,
        readGeneration,
      )
    } else if (createsNotebook(call.name)) {
      const created = createdBufferIdOf(out.content)
      if (created !== null) {
        ctx.freshness.recordRead(
          created,
          getBufferActionSeq(created),
          readGeneration,
        )
      }
    }
  }
  return wrapDispatchToolOutput(out)
}
