import type { createUserActionDigestState } from "../../providers/AIConversationProvider/userActionDigest"
import type { Permissions } from "../tools/permissions"
import type { DispatchContext } from "./dispatchMCPTool"

type Told = (sent: boolean) => void

// Whether the agent has been told about the latest permission change.
export const createPermissionsNoticeState = () => {
  let changes = 0
  let toldChanges = 0
  return {
    markChanged() {
      changes += 1
    },
    capture(): { due: boolean; finish: Told } {
      const at = changes
      return {
        due: at > toldChanges,
        finish(sent) {
          if (sent && at > toldChanges) toldChanges = at
        },
      }
    },
  }
}

export type PermissionsNoticeState = ReturnType<
  typeof createPermissionsNoticeState
>

type UserActionDigestState = ReturnType<typeof createUserActionDigestState>

// One call's dispatch context. What the call's result tells the agent, its
// notebook reads, the permission notice and the user's actions, counts only
// once that result is sent: settle(true). A result that is dropped (Stop, a
// bridge cancel, a deadline, a revoked permission) settles false and commits
// none of it. The next result that is sent then carries the notice and the
// actions, and the stale-edit guard does not trust a read the agent never got.
// Likewise a suggested query shows only once the agent is told it does.
export const deferUntilSent = (
  ctx: Omit<DispatchContext, "permissions"> & {
    getPermissions: () => Permissions
  },
  sources: {
    permissionsNotice: PermissionsNoticeState
    userActions: UserActionDigestState
  },
): { ctx: DispatchContext; settle: (sent: boolean) => void } => {
  const { getPermissions, onSuggestedQuery, ...dispatch } = ctx
  const pending: Told[] = []
  return {
    ctx: {
      ...dispatch,
      ...(onSuggestedQuery && {
        onSuggestedQuery: (sql: string) => {
          pending.push((sent) => {
            if (sent) onSuggestedQuery(sql)
          })
        },
      }),
      freshness: {
        ...ctx.freshness,
        recordRead: (bufferId, seq, readAtGeneration) => {
          pending.push((sent) => {
            if (sent) ctx.freshness.recordRead(bufferId, seq, readAtGeneration)
          })
        },
      },
      permissions: {
        get: getPermissions,
        consumeDirty: () => {
          const notice = sources.permissionsNotice.capture()
          pending.push(notice.finish)
          return notice.due
        },
      },
      metaToolContext: {
        ...ctx.metaToolContext,
        consumeDigest: () => {
          const capture = sources.userActions.capture()
          if (capture) pending.push(capture.finish)
          return capture?.digest ?? null
        },
      },
    },
    settle: (sent) => {
      for (const told of pending.splice(0)) told(sent)
    },
  }
}
