import { CommandNote, type CommandNoteEntry } from "./CommandNote"
import { ImageAttachments } from "./ImageAttachments"
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import styled, { css, useTheme, type DefaultTheme } from "styled-components"
import { LiteEditor } from "../../../components/LiteEditor"
import {
  Box,
  Text,
  Button,
  IconButton as SharedIconButton,
} from "../../../components"
import type { SchemaDisplayData } from "../../../providers/AIConversationProvider/types"
import { color, getTableKind } from "../../../utils"
import { withAlpha } from "../../../theme"
import type {
  ConversationMessage,
  UserMessageDisplayType,
} from "../../../providers/AIConversationProvider/types"
import { trimSemicolonForDisplay } from "../../../providers/AIConversationProvider/utils"
import { normalizeQueryText, createDetachedQueryKey } from "../Monaco/utils"
import {
  PlayIcon,
  ErrorIcon,
  SuccessIcon,
  ExpandUpDownIcon,
} from "../Monaco/icons"
import {
  ArrowDownIcon,
  CodeIcon,
  KeyReturnIcon,
  ChatDotsIcon,
  ArrowCounterClockwiseIcon,
  HammerIcon,
  FileSqlIcon,
  GradientIcon,
  StethoscopeIcon,
  XSquareIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { CloseCircle } from "../../../components/icons"
import {
  SCROLL_TO_END_KEYS,
  SCROLL_TO_END_LABEL,
  isCaretAtEndOfText,
  isScrollToEndShortcut,
} from "./scrollToEndShortcut"
import { Stop } from "../../../components/icons"
import { CheckmarkOutline, CloseOutline } from "../../../components/icons"
import { TableIcon } from "../../Schema/table-icon"
import { AssistantMessageContent } from "./AssistantMessageContent"
import { formatDurationMs } from "../../../components/AIStatusIndicator/AssistantModes"
import type { QueryNotifications } from "../../../store/Query/types"
import { NotificationType } from "../../../store/Query/types"
import type { QueryKey } from "../Monaco/utils"
import { useAIStatus } from "../../../providers/AIStatusProvider"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import {
  getScrollLength,
  projectConversationTurns,
  type VisibleEntry,
} from "../../../utils/ai/turnView"

type QueryRunStatus = "neutral" | "loading" | "success" | "error"

// How long the user stays at the end of the output before it is followed
// again, and how close to the end counts as there.
const FOLLOW_RESUME_DELAY_MS = 500
const FOLLOW_RESUME_DISTANCE_PX = 8
// How long without scrolling before a wheel scroll counts as settled.
const SCROLL_SETTLE_MS = 150
// How far from the end the output must be to offer scrolling to it.
const SCROLL_TO_END_DISTANCE_PX = 120
// Farther than this, scrolling to the end jumps instead of animating.
const SMOOTH_SCROLL_MAX_DISTANCE_PX = 3000

// A wheel event bubbles even when its default scroll stays inside the output.
const wheelStaysInside = (event: WheelEvent, container: HTMLElement) => {
  for (const target of event.composedPath()) {
    if (target === container) break
    if (!(target instanceof Element)) continue
    const maxScrollTop = target.scrollHeight - target.clientHeight
    if (maxScrollTop <= 0) continue
    const { overflow, overflowY, overscrollBehaviorY } =
      getComputedStyle(target)
    if (!/^(auto|scroll)$/.test(overflowY || overflow)) continue
    if (overscrollBehaviorY === "contain" || overscrollBehaviorY === "none") {
      return true
    }
    // Round away subpixel differences at the bottom (scrollHeight and
    // clientHeight are integers).
    if (
      event.deltaY < 0
        ? target.scrollTop > 0
        : Math.ceil(target.scrollTop) < maxScrollTop
    ) {
      return true
    }
  }
  return false
}

const MessagesContainer = styled(Box)<{ $scrolled: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem 1rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  ${({ $scrolled }) =>
    !$scrolled &&
    css`
      opacity: 0;
    `}
`

const MessageBubble = styled(Box).attrs({ align: "flex-start" })`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  border-radius: 0.8rem;
  width: 100%;
  align-self: flex-end;
  background: ${({ theme }) =>
    theme.mode === "light"
      ? theme.color.surfaceValue
      : theme.color.authBackdrop};
  border: 1px solid ${color("borderDefault")};
  flex-shrink: 0;
`

const UserRequestBox = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  width: 100%;
  align-self: flex-end;
  background: ${({ theme }) =>
    theme.mode === "light"
      ? theme.color.surfaceValue
      : theme.color.authBackdrop};
  border: 1px solid ${color("borderDefault")};
  border-radius: 0.6rem;
  flex-shrink: 0;
`

const UserRequestHeader = styled(Box).attrs({
  alignItems: "center",
  gap: "0.8rem",
})`
  width: 100%;
  padding: 0.4rem;
  flex: 1 0 auto;
`

const UserRequestContent = styled(Box)`
  display: flex;
  flex-direction: column;
  border-radius: 0.6rem;
  overflow: hidden;
  flex-shrink: 0;
  width: 100%;
  align-items: flex-start;
`

const InlineSQLEditor = styled.div`
  width: 100%;
`

// Operation Badge components for fix/explain/generate/schema requests
const OperationBadge = styled(Box).attrs({
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding: 0 0.4rem;
`

const BadgeIconContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background: ${({ theme }) => withAlpha(theme.color.aiPinkStart, 0.12)};
  border: 1px solid ${({ theme }) => withAlpha(theme.color.aiPinkStart, 0.42)};
  border-radius: 0.4rem;
  padding: 0.8rem;
  width: 4.8rem;
  height: 4rem;
  flex-shrink: 0;
`

const BadgeIconWrapper = styled.div`
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.aiPinkStart};

  svg {
    width: 100%;
    height: 100%;
  }
`

const BadgeTitle = styled(Text)`
  font-weight: 500;
  font-size: 1.6rem;
  line-height: 1.6rem;
  color: ${color("contentPrimary")};
`

const BadgeDescriptionContainer = styled(Box)`
  align-items: flex-start;
  flex-direction: column;
  padding: 0.8rem;
  width: 100%;
`

const BadgeDescriptionText = styled(Text)`
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("contentPrimary")};
`

const BadgeDescriptionIssueText = styled(Text)<{
  $severity?: "critical" | "warning"
}>`
  font-size: 1.4rem;
  line-height: 2.1rem;
  font-weight: 600;
`

const IssueMessageRow = styled(Box)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const SchemaNameDisplay = styled(Button).attrs({ variant: "tertiary" })`
  margin-left: 0.4rem;
  padding: 0.5rem 1rem;
  align-items: center;
  gap: 1rem;
  border-radius: 0.6rem;
`

const SchemaName = styled(Text)`
  font-size: 1.4rem;
  color: ${color("contentPrimary")};
`

const MessageContent = styled(Text)`
  font-size: 1.4rem;
  line-height: 1.8rem;
  color: ${color("contentPrimary")};
  white-space: pre-wrap;
  word-wrap: break-word;
`

const ExplanationBox = styled(Box)<{ $hasOperationHistory?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: 100%;
  align-self: flex-start;
  text-align: left;
  background: transparent;
  padding: 0.4rem;
  border-radius: 0.6rem;
  flex-shrink: 0;

  ${({ $hasOperationHistory }) =>
    $hasOperationHistory &&
    css`
      padding-top: 0;
    `}

  .response-actions,
  .response-metadata {
    transition: opacity 0.2s;
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    .response-actions,
    .response-metadata {
      opacity: 1;
    }
  }

  @media (hover: none) {
    .response-actions,
    .response-metadata {
      opacity: 1;
    }
  }
`

const ResponseMetadata = styled.div.attrs({ className: "response-metadata" })`
  align-self: stretch;
  padding-inline: 0.8rem;
  font-size: 1.1rem;
  line-height: 1.4rem;
  text-align: start;
  color: ${color("contentMuted")};
  overflow-wrap: anywhere;
`

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.5rem;
  padding: 0.4rem 0.4rem 0.4rem 0.8rem;
  border: 1px solid ${color("statusDanger")};
  border-radius: 0.6rem;
  color: ${color("contentPrimary")};
  font-size: 1.4rem;
  line-height: 2rem;
  width: 100%;
`

const RetryButton = styled(Button)`
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.5rem 0.8rem;
  height: auto;
`

const MessagesArea = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
`

const ScrollToEndButton = styled(Button)`
  position: absolute;
  left: 50%;
  bottom: 1.2rem;
  transform: translateX(-50%);
  z-index: 1;
  width: auto;
  padding: 0 1.2rem;
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: 0 0.4rem 1.2rem ${({ theme }) => theme.color.shadowMedium};
`

const ScrollToEndShortcut = styled.span`
  margin-left: 0.4rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

const MessagesEnd = styled.div`
  min-height: 1px;
  width: 100%;
  background: transparent;
`

const DiffContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
  padding: 0.8rem 1.2rem;
  border: 1px solid ${color("interactionNeutral")};
  border-radius: 0.8rem;
  background: ${color("surfaceInset")};
  width: 100%;
`

const DiffHeader = styled(Box)<{ $isExpanded?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid ${color("interactionNeutralHover")};
  width: 100%;
  ${({ $isExpanded }) =>
    !$isExpanded &&
    css`
      border-bottom: 0;
      padding-bottom: 0;
    `}
`

const DiffHeaderLeft = styled(Box)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
`

const DiffHeaderLabel = styled.span`
  font-size: 1.4rem;
  color: ${color("contentSecondary")};
`

const DiffHeaderRight = styled(Box)`
  display: flex;
  align-items: center;
  gap: 1.8rem;
  margin-left: auto;
`

const DiffHeaderStatus = styled(Box)<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
    if ($isRejected) return color("statusDanger")
    if ($isRejectedWithFollowUp) return color("statusInfo")
    if ($isAccepted) return color("statusSuccessStrong")
    return color("contentSecondary")
  }};
  font-size: 1.3rem;
`

const StatusIcon = styled.span<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  align-items: center;
  color: ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
    if ($isRejected) return color("statusDanger")
    if ($isRejectedWithFollowUp) return color("statusInfo")
    if ($isAccepted) return color("statusSuccessStrong")
    return color("contentSecondary")
  }};
`

const IconButton = styled(SharedIconButton)`
  color: ${color("contentSecondary")};

  &:hover:not(:disabled) {
    svg {
      filter: brightness(1.3);
    }
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const ExpandButton = styled(IconButton)`
  width: 1.6rem;
  height: 1.6rem;
`

const DiffEditorWrapper = styled.div`
  position: relative;
  width: 100%;
`

const ButtonBar = styled(Box)`
  padding: 0.5rem;
  gap: 1rem;
  justify-content: center;
  flex-shrink: 0;
  width: fit-content;
  margin: 0 auto;
  background: ${color("surfaceInset")};
  border: 1px solid ${color("interactionNeutral")};
  border-radius: 0.4rem;
`

const AcceptButton = styled(Button).attrs({ variant: "primary" })`
  width: 10rem;
`

const RejectButton = styled(Button).attrs({ variant: "secondary" })`
  width: 10rem;
`

export type OpenInEditorContent =
  | { type: "diff"; original: string; modified: string }
  | { type: "code"; value: string }

type ChatMessagesProps = {
  messages: ConversationMessage[]
  // What the console commands the user ran did, like /model.
  commandNotes?: CommandNoteEntry[]
  onAcceptChange?: (messageId: string) => void
  onRejectChange?: (messageId: string) => void
  onRunQuery?: (sql: string) => void
  onOpenInEditor: (
    content: OpenInEditorContent,
    existingQuery?: boolean,
  ) => Promise<void>
  // Apply SQL to editor and mark that specific message as accepted
  onApplyToEditor?: (messageId: string, sql: string) => void
  onRetry?: (userMessageId: string) => void
  retryDisabled?: boolean
  onCancelQuery?: (queryKey: QueryKey) => void
  // Query execution status
  runningQueryKey?: QueryKey | null
  // Query notifications for this conversation's buffer - keyed by QueryKey
  queryNotifications?: Record<QueryKey, QueryNotifications>
  // Whether an AI operation is in progress
  isOperationInProgress?: boolean
  // Current SQL in editor (acceptedSQL) - used to hide Apply button when suggestion matches editor
  editorSQL?: string
  isStreaming: boolean
  isLoadingMessages?: boolean
  // Message ID to scroll to (for cache hits)
  scrollToMessageId?: string | null
  onScrollToMessageComplete: () => void
}

const getOperationBadgeInfo = (
  displayType: UserMessageDisplayType,
): { icon: React.ReactNode; title: string; description?: string } | null => {
  switch (displayType) {
    case "fix_request":
      return {
        icon: <HammerIcon size={24} />,
        title: "Fix Query",
        description:
          "Help me debug and fix the error with the attached SQL query",
      }
    case "explain_request":
      return {
        icon: <FileSqlIcon size={24} />,
        title: "Explain Query",
        description: "Explain this query in detail",
      }
    case "schema_explain_request": {
      return {
        icon: <GradientIcon size={24} />,
        title: "Explain Schema",
        description:
          "Provide an overview, detailed column descriptions and storage details.",
      }
    }
    case "health_issue_request": {
      return {
        icon: <StethoscopeIcon size={24} />,
        title: "Health Issue Analysis",
        description:
          "Analyze table health issue and provide steps for resolution:",
      }
    }
    default:
      return null
  }
}

// Helper to get the appropriate icon based on query run status
const getQueryStatusIcon = (status: QueryRunStatus, theme: DefaultTheme) => {
  switch (status) {
    case "loading":
      return <Stop size={24} color={theme.color.statusDanger} />
    case "success":
      return <SuccessIcon />
    case "error":
      return <ErrorIcon />
    default:
      return <PlayIcon />
  }
}

// Images the user attached, above what they wrote.
const BubbleImages = styled.div`
  margin-bottom: 0.8rem;
`

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  commandNotes = [],
  onAcceptChange,
  onRejectChange,
  onRunQuery,
  onOpenInEditor,
  onApplyToEditor,
  onRetry,
  retryDisabled,
  onCancelQuery,
  runningQueryKey,
  queryNotifications,
  isOperationInProgress,
  editorSQL,
  isStreaming,
  isLoadingMessages,
  scrollToMessageId,
  onScrollToMessageComplete,
}) => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const tables = useSelector(selectors.query.getTables)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const { status } = useAIStatus()
  const [scrolled, setScrolled] = useState(false)
  const userScrolledRef = useRef(false)
  const [showScrollToEnd, setShowScrollToEnd] = useState(false)
  const inProgressRef = useRef(isOperationInProgress)
  // Set while scrolling to the end on request, so the offer does not
  // reappear on the way there.
  const scrollingToEndRef = useRef(false)

  // Offers to scroll to the end when the output is out of view: while an
  // answer runs, only once the user stopped following it.
  const updateScrollToEnd = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceToEnd =
      container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceToEnd <= FOLLOW_RESUME_DISTANCE_PX) {
      scrollingToEndRef.current = false
    }
    setShowScrollToEnd(
      !scrollingToEndRef.current &&
        distanceToEnd > SCROLL_TO_END_DISTANCE_PX &&
        (userScrolledRef.current || !inProgressRef.current),
    )
  }, [])

  const scrollToEnd = useCallback(() => {
    userScrolledRef.current = false
    scrollingToEndRef.current = true
    setShowScrollToEnd(false)
    const container = messagesContainerRef.current
    const distanceToEnd = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight
      : 0
    messagesEndRef.current?.scrollIntoView({
      behavior:
        distanceToEnd > SMOOTH_SCROLL_MAX_DISTANCE_PX ? "instant" : "smooth",
    })
  }, [])

  useEffect(() => {
    inProgressRef.current = isOperationInProgress
    updateScrollToEnd()
  }, [isOperationInProgress, updateScrollToEnd])

  // Cmd+Down (Ctrl+End) scrolls to the end, from anywhere in the chat.
  useEffect(() => {
    if (!showScrollToEnd) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isScrollToEndShortcut(event) || !isCaretAtEndOfText(event.target)) {
        return
      }
      const chatWindow = messagesContainerRef.current?.closest(
        '[data-hook="ai-chat-window"]',
      )
      const target = event.target as Node | null
      if (target !== document.body && !chatWindow?.contains(target)) return
      event.preventDefault()
      scrollToEnd()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [showScrollToEnd, scrollToEnd])

  const handleScrollNeeded = useCallback(() => {
    if (scrolled && userScrolledRef.current) return
    if (scrollToMessageId) return
    const behavior = scrolled ? "smooth" : "instant"
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
      setScrolled(true)
    })
  }, [scrolled, scrollToMessageId])

  const handleSchemaNameDisplayClick = useCallback(
    (schemaData: SchemaDisplayData) => {
      const table = tables.find(
        (t) =>
          t.table_name === schemaData.tableName &&
          getTableKind(t) === schemaData.kind,
      )
      if (table) {
        dispatch(
          actions.console.pushSidebarHistory({
            type: "tableDetails",
            payload: {
              tableName: table.table_name,
              kind: getTableKind(table),
            },
          }),
        )
      }
    },
    [tables],
  )

  // Scrolling with the wheel stops following the output. Coming back to the
  // end and staying there for a moment follows it again; only moving away
  // from it cancels that wait.
  //
  // While an answer streams, the end moves as the user scrolls to it: steps
  // above collapse, text grows. So a wheel scroll down that the end stopped
  // short of where it was headed counts as reaching the end, wherever the
  // end has moved since. Neither collapsing nor growing output fires a
  // scroll event once the user stopped, so this is checked when the
  // scrolling settles.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    let resumeTimer: ReturnType<typeof setTimeout> | undefined
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    // Where the latest wheel scroll down was headed; null after scrolling up.
    let wheelTarget: number | null = null
    let lastScrollTop = container.scrollTop

    const distanceToEnd = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight

    const cancelResume = () => {
      clearTimeout(resumeTimer)
      resumeTimer = undefined
    }

    const scheduleResume = () => {
      if (resumeTimer) return
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined
        scrollToEnd()
      }, FOLLOW_RESUME_DELAY_MS)
    }

    const checkSettled = () => {
      settleTimer = undefined
      if (!userScrolledRef.current || wheelTarget === null) return
      const stoppedShort = wheelTarget > container.scrollTop + 1
      // A scroll that stopped short far from the end was not stopped by it.
      if (stoppedShort && distanceToEnd() <= container.clientHeight) {
        scheduleResume()
      }
    }

    const scheduleSettleCheck = () => {
      clearTimeout(settleTimer)
      settleTimer = setTimeout(checkSettled, SCROLL_SETTLE_MS)
    }

    const handleWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        !event.deltaY ||
        wheelStaysInside(event, container)
      )
        return
      userScrolledRef.current = true
      scrollingToEndRef.current = false
      if (event.deltaY < 0) {
        cancelResume()
        wheelTarget = null
        return
      }
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * container.clientHeight
            : event.deltaY
      wheelTarget = Math.max(wheelTarget ?? 0, container.scrollTop) + pixels
      // Already at the end, a wheel scroll down moves nothing and fires no
      // scroll event.
      scheduleSettleCheck()
    }

    const handleScroll = () => {
      const movedUp = container.scrollTop < lastScrollTop - 1
      lastScrollTop = container.scrollTop
      updateScrollToEnd()
      if (!userScrolledRef.current) return
      // Output that shrinks above moves the view up too, but keeps it at the
      // end: that is no reason to cancel.
      if (distanceToEnd() <= FOLLOW_RESUME_DISTANCE_PX) {
        scheduleResume()
        return
      }
      // Moving up, by any means, cancels the wait.
      if (movedUp) {
        cancelResume()
        wheelTarget = null
        return
      }
      scheduleSettleCheck()
    }

    container.addEventListener("wheel", handleWheel)
    container.addEventListener("scroll", handleScroll)
    return () => {
      cancelResume()
      clearTimeout(settleTimer)
      container.removeEventListener("wheel", handleWheel)
      container.removeEventListener("scroll", handleScroll)
    }
  }, [updateScrollToEnd, scrollToEnd])

  // A new question follows its answer again. Messages the answer adds itself,
  // like tool results and follow-ups, leave the user where they scrolled.
  const userMessageCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  )
  useEffect(() => {
    userScrolledRef.current = false
  }, [userMessageCount])

  const latestDiffIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "assistant" && msg.sql) {
        return i
      }
    }
    return -1
  }, [messages])

  const prevLatestDiffIndexRef = useRef<number>(
    latestDiffIndex >= 0 ? latestDiffIndex : -1,
  )

  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(
    latestDiffIndex >= 0 ? new Set([latestDiffIndex]) : new Set(),
  )

  useEffect(() => {
    // Only auto-expand if this is a genuinely new diff (index changed)
    if (
      latestDiffIndex >= 0 &&
      latestDiffIndex !== prevLatestDiffIndexRef.current
    ) {
      setExpandedDiffs((prev) => new Set([...prev, latestDiffIndex]))
      prevLatestDiffIndexRef.current = latestDiffIndex
    }
  }, [latestDiffIndex])

  const { visibleEntries, lastAssistantAnchorIndex, lastVisibleUserIndex } =
    useMemo(() => projectConversationTurns(messages), [messages])

  const scrollLength = useMemo(
    () => getScrollLength(isStreaming, messages),
    [isStreaming, messages],
  )

  useEffect(() => {
    handleScrollNeeded()
    updateScrollToEnd()
  }, [scrollLength, handleScrollNeeded, updateScrollToEnd])

  // A command's note comes into view like a message does.
  useEffect(() => {
    if (commandNotes.length > 0) handleScrollNeeded()
  }, [commandNotes.length])

  useLayoutEffect(() => {
    if (!scrollToMessageId || isLoadingMessages) return

    const messageEl = messageRefs.current.get(scrollToMessageId)
    if (messageEl) {
      const timeoutId = setTimeout(() => {
        messageEl.scrollIntoView({ behavior: "smooth", block: "start" })
        setScrolled(true)
        onScrollToMessageComplete()
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [scrollToMessageId, isLoadingMessages, onScrollToMessageComplete])

  useEffect(() => {
    return () => {
      onScrollToMessageComplete()
    }
  }, [])

  const lastVisibleEntry = visibleEntries[visibleEntries.length - 1]
  const lastVisibleMessageIndex =
    visibleEntries.length > 0
      ? lastVisibleEntry.type === "user"
        ? lastVisibleEntry.index
        : lastVisibleEntry.anchorIndex
      : -1

  const lastAssistantMessageIndex = lastAssistantAnchorIndex

  // Notes of console commands, like /model, after the message they follow.
  const notesAfter = (messageId: string | null) =>
    commandNotes
      .filter((note) => note.afterMessageId === messageId)
      .map((note) => <CommandNote key={note.id} note={note} />)

  const renderEntry = (entry: VisibleEntry): React.ReactNode => {
    if (entry.type === "user") {
      const { message } = entry
      const key = `${message.id}`
      const severity = message.displayHealthIssueData?.severity
      const isCurrentQuery =
        normalizeQueryText(message.sql || "") ===
        normalizeQueryText(editorSQL || "")

      // Check if this is a special request type with inline SQL display
      const displayType = message.displayType
      const sql = message.sql

      // Render badge/title/description types
      if (displayType && displayType !== "ask_request") {
        const badgeInfo = getOperationBadgeInfo(displayType)

        // Determine content to render below badge/description
        let content: React.ReactNode = null

        if (
          displayType === "schema_explain_request" &&
          message.displaySchemaData
        ) {
          const schemaData = message.displaySchemaData
          content = (
            <UserRequestContent>
              <SchemaNameDisplay
                onClick={() => handleSchemaNameDisplayClick(schemaData)}
              >
                <TableIcon
                  kind={schemaData.kind}
                  partitionBy={schemaData.partitionBy}
                  walEnabled={schemaData.walEnabled}
                  designatedTimestamp={schemaData.designatedTimestamp}
                />
                <SchemaName>{schemaData.tableName}</SchemaName>
              </SchemaNameDisplay>
            </UserRequestContent>
          )
        } else if (
          displayType === "health_issue_request" &&
          message.displayHealthIssueData
        ) {
          const healthData = message.displayHealthIssueData
          content = (
            <UserRequestContent>
              <SchemaNameDisplay>
                <TableIcon kind="table" />
                <SchemaName>{healthData.tableName}</SchemaName>
              </SchemaNameDisplay>
            </UserRequestContent>
          )
        } else if (sql) {
          // fix_request and explain_request show SQL editor
          content = (
            <UserRequestContent>
              <InlineSQLEditor data-hook="user-request-sql-editor">
                <LiteEditor
                  value={sql}
                  maxHeight={216}
                  onOpenInEditor={() =>
                    onOpenInEditor({ type: "code", value: sql }, isCurrentQuery)
                  }
                />
              </InlineSQLEditor>
            </UserRequestContent>
          )
        }

        return (
          <UserRequestBox
            key={key}
            data-hook="chat-message-user"
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el)
            }}
          >
            <OperationBadge>
              <BadgeIconContainer>
                <BadgeIconWrapper>{badgeInfo?.icon}</BadgeIconWrapper>
              </BadgeIconContainer>
              <BadgeTitle>{badgeInfo?.title}</BadgeTitle>
            </OperationBadge>
            {badgeInfo?.description && (
              <BadgeDescriptionContainer>
                <BadgeDescriptionText>
                  {badgeInfo.description}
                </BadgeDescriptionText>
                {displayType === "health_issue_request" &&
                  message.displayHealthIssueData?.issueMessage && (
                    <IssueMessageRow>
                      {severity === "critical" ? (
                        <XSquareIcon
                          size={14}
                          weight="fill"
                          color={theme.color.statusDanger}
                        />
                      ) : (
                        <WarningIcon
                          size={14}
                          weight="fill"
                          color={theme.color.statusWarning}
                        />
                      )}
                      <BadgeDescriptionIssueText
                        color={
                          severity === "critical"
                            ? "statusDanger"
                            : "statusWarning"
                        }
                      >
                        {message.displayHealthIssueData.issueMessage}
                      </BadgeDescriptionIssueText>
                    </IssueMessageRow>
                  )}
              </BadgeDescriptionContainer>
            )}
            {content}
          </UserRequestBox>
        )
      }

      // An image-only message has an empty display string, not a missing one.
      const userText = message.displayUserMessage ?? message.content
      const images = message.images?.length ? (
        <BubbleImages>
          <ImageAttachments images={message.images} size={8} />
        </BubbleImages>
      ) : null

      // Special handling for ask_request: show user's question above SQL
      if (displayType === "ask_request" && sql) {
        return (
          <UserRequestBox
            key={key}
            data-hook="chat-message-user"
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el)
            }}
          >
            {images}
            {userText && (
              <UserRequestHeader>
                <MessageContent>{userText}</MessageContent>
              </UserRequestHeader>
            )}
            <UserRequestContent>
              <InlineSQLEditor data-hook="user-request-sql-editor">
                <LiteEditor
                  value={sql}
                  maxHeight={216}
                  onOpenInEditor={() =>
                    onOpenInEditor({ type: "code", value: sql }, isCurrentQuery)
                  }
                />
              </InlineSQLEditor>
            </UserRequestContent>
          </UserRequestBox>
        )
      }

      return (
        <MessageBubble
          key={key}
          data-hook="chat-message-user"
          ref={(el) => {
            if (el) messageRefs.current.set(message.id, el)
          }}
        >
          {images}
          {userText && <MessageContent>{userText}</MessageContent>}
        </MessageBubble>
      )
    }

    const {
      anchorMessage: message,
      anchorIndex: originalIndex,
      turnMessages,
    } = entry
    const key = `${message.id}`
    const isCurrentQuery =
      normalizeQueryText(message.sql || "") ===
      normalizeQueryText(editorSQL || "")

    // Assistant message - show as ExplanationBox (bundle entire turn under anchor)
    const hasSQLChange = !!message.sql
    const isSQLUnchanged =
      hasSQLChange &&
      message.previousSQL !== undefined &&
      normalizeQueryText(message.sql || "") ===
        normalizeQueryText(message.previousSQL || "")
    const isExpanded = expandedDiffs.has(originalIndex)

    // Read status from message, compute isRejectedWithFollowUp from message positions
    const isAccepted = message.isAccepted === true
    const isRejected = message.isRejected === true
    // A message is "followed up" if it has SQL, isn't accepted/rejected, and has a visible user message after it
    const isRejectedWithFollowUp =
      hasSQLChange &&
      !isAccepted &&
      !isRejected &&
      originalIndex < lastVisibleUserIndex

    const isLastVisibleMessage = originalIndex === lastVisibleMessageIndex
    const isMessageStreaming = isStreaming && isLastVisibleMessage
    const showButtons =
      hasSQLChange &&
      !isSQLUnchanged &&
      !isAccepted &&
      !isRejected &&
      !isRejectedWithFollowUp &&
      isLastVisibleMessage

    // Compute query run status for this message's SQL
    let queryRunStatus: QueryRunStatus = "neutral"
    if (message.sql) {
      const normalizedMessageSQL = normalizeQueryText(message.sql)
      const queryKey = createDetachedQueryKey(normalizedMessageSQL)
      // Check if this query is currently running
      if (runningQueryKey && queryKey === runningQueryKey) {
        queryRunStatus = "loading"
      }
      // Check if we have a notification for this specific query in queryNotifications
      // The query key is created from the normalized SQL and the conversation's queryStartOffset
      else if (queryNotifications) {
        const notification = queryNotifications[queryKey]?.latest
        if (notification) {
          if (notification.type === NotificationType.ERROR) {
            queryRunStatus = "error"
          } else if (
            notification.type === NotificationType.SUCCESS ||
            notification.type === NotificationType.INFO
          ) {
            queryRunStatus = "success"
          }
        }
      }
    }

    const previousSQLForDiff = trimSemicolonForDisplay(message.previousSQL)
    const currentSQLForDiff = trimSemicolonForDisplay(message.sql)

    const hasError = !!message.error
    const showRetry =
      hasError && !isStreaming && !isOperationInProgress && isLastVisibleMessage

    const isLiveOperation =
      originalIndex === lastAssistantMessageIndex &&
      isOperationInProgress === true

    const hasOperationHistory =
      !!message.operationHistory && message.operationHistory.length > 0
    const responseMetadata =
      !isLiveOperation && !isMessageStreaming
        ? [message.model, formatDurationMs(message.turnDurationMs ?? 0)]
            .filter(Boolean)
            .join(" · ")
        : ""

    return (
      <ExplanationBox
        key={key}
        $hasOperationHistory={hasOperationHistory}
        data-hook="chat-message-assistant"
        ref={(el) => {
          if (el) messageRefs.current.set(message.id, el)
        }}
      >
        <AssistantMessageContent
          turnMessages={turnMessages}
          anchorMessage={message}
          status={status}
          isLiveOperation={isLiveOperation}
          isMessageStreaming={isMessageStreaming}
          onScrollNeeded={handleScrollNeeded}
          onOpenInEditor={onOpenInEditor}
        />
        {hasSQLChange && !isMessageStreaming && (
          <DiffContainer data-hook="inline-diff-container">
            <DiffHeader $isExpanded={isExpanded}>
              <DiffHeaderLeft>
                <CodeIcon size={22} color={theme.color.contentSecondary} />
                <DiffHeaderLabel>Suggested change</DiffHeaderLabel>
              </DiffHeaderLeft>
              {isSQLUnchanged && (
                <DiffHeaderStatus data-hook="diff-status-unchanged">
                  <StatusIcon>
                    <CheckmarkOutline size="14px" />
                  </StatusIcon>
                  Already accepted
                </DiffHeaderStatus>
              )}
              {!isSQLUnchanged &&
                (isAccepted || isRejected || isRejectedWithFollowUp) && (
                  <DiffHeaderStatus
                    $isAccepted={isAccepted}
                    $isRejected={isRejected}
                    $isRejectedWithFollowUp={isRejectedWithFollowUp}
                    data-hook={
                      isRejected
                        ? "diff-status-rejected"
                        : isRejectedWithFollowUp
                          ? "diff-status-followed-up"
                          : "diff-status-accepted"
                    }
                  >
                    <StatusIcon
                      $isAccepted={isAccepted}
                      $isRejected={isRejected}
                      $isRejectedWithFollowUp={isRejectedWithFollowUp}
                    >
                      {isRejected ? (
                        <CloseOutline size="14px" />
                      ) : isRejectedWithFollowUp ? (
                        <ChatDotsIcon size="14px" />
                      ) : (
                        <CheckmarkOutline size="14px" />
                      )}
                    </StatusIcon>
                    {isRejected
                      ? "Rejected"
                      : isRejectedWithFollowUp
                        ? "Followed up"
                        : "Accepted"}
                  </DiffHeaderStatus>
                )}
              <DiffHeaderRight>
                <IconButton
                  label={
                    queryRunStatus === "loading"
                      ? "Cancel query"
                      : "Run this query"
                  }
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (queryRunStatus === "loading" && message.sql) {
                      onCancelQuery?.(
                        createDetachedQueryKey(normalizeQueryText(message.sql)),
                      )
                    } else if (message.sql && onRunQuery) {
                      onRunQuery(message.sql)
                    }
                  }}
                  title={
                    queryRunStatus === "loading"
                      ? "Cancel query"
                      : "Run this query"
                  }
                  aria-label={
                    queryRunStatus === "loading"
                      ? "Cancel query"
                      : "Run this query"
                  }
                  data-hook="message-action-run-sql"
                >
                  {getQueryStatusIcon(queryRunStatus, theme)}
                </IconButton>
                {!showButtons &&
                  onApplyToEditor &&
                  !(originalIndex === latestDiffIndex && isAccepted) &&
                  !isCurrentQuery && (
                    <IconButton
                      label="Apply to editor"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (
                          message.id &&
                          message.sql &&
                          !isOperationInProgress
                        ) {
                          void trackEvent(
                            ConsoleEvent.AI_EDITOR_SUGGESTION_APPLY,
                          )
                          onApplyToEditor(message.id, message.sql)
                        }
                      }}
                      title="Apply to editor"
                      aria-label="Apply to editor"
                      disabled={isOperationInProgress}
                      data-hook="message-action-apply"
                    >
                      <KeyReturnIcon
                        size={22}
                        color={theme.color.contentSecondary}
                      />
                    </IconButton>
                  )}
                <ExpandButton
                  label={isExpanded ? "Collapse diff view" : "Expand diff view"}
                  size="sm"
                  title="Expand diff view"
                  aria-label={
                    isExpanded ? "Collapse diff view" : "Expand diff view"
                  }
                  aria-expanded={isExpanded}
                  data-hook="diff-expand-button"
                  onClick={() => {
                    setExpandedDiffs((prev) => {
                      const next = new Set(prev)
                      if (next.has(originalIndex)) {
                        next.delete(originalIndex)
                      } else {
                        next.add(originalIndex)
                      }
                      return next
                    })
                  }}
                >
                  <ExpandUpDownIcon />
                </ExpandButton>
              </DiffHeaderRight>
            </DiffHeader>
            {isExpanded && (
              <>
                <DiffEditorWrapper>
                  <LiteEditor
                    diffEditor
                    original={previousSQLForDiff}
                    modified={currentSQLForDiff}
                    maxHeight={300}
                    onOpenInEditor={() =>
                      onOpenInEditor({
                        type: "diff",
                        original: previousSQLForDiff ?? "",
                        modified: currentSQLForDiff ?? "",
                      })
                    }
                    handleScrollNeeded={handleScrollNeeded}
                  />
                </DiffEditorWrapper>
                {showButtons && (
                  <ButtonBar align="center" justifyContent="center">
                    {onRejectChange && message.id && (
                      <RejectButton
                        onClick={() => onRejectChange(message.id)}
                        data-hook="message-action-reject"
                      >
                        Reject
                      </RejectButton>
                    )}
                    {onAcceptChange && message.id && (
                      <AcceptButton
                        onClick={() => onAcceptChange(message.id)}
                        data-hook="message-action-accept"
                      >
                        Accept
                      </AcceptButton>
                    )}
                  </ButtonBar>
                )}
              </>
            )}
          </DiffContainer>
        )}
        {hasError && (
          <ErrorContainer role="alert" data-hook="chat-message-error">
            <CloseCircle
              size={16}
              color={theme.color.statusDanger}
              style={{ flexShrink: 0 }}
            />
            {message.error}
            {showRetry && onRetry && (
              <RetryButton
                size="sm"
                variant="secondary"
                prefixIcon={<ArrowCounterClockwiseIcon size={12} />}
                onClick={() => {
                  const userMessageIndex = messages
                    .slice(0, originalIndex)
                    .findLastIndex((m) => m.role === "user")
                  if (userMessageIndex >= 0) {
                    onRetry(messages[userMessageIndex].id)
                  }
                }}
                disabled={retryDisabled}
                title={
                  retryDisabled ? "Waiting for your coding agent" : undefined
                }
                data-hook="retry-button"
              >
                Retry
              </RetryButton>
            )}
          </ErrorContainer>
        )}
        {responseMetadata && (
          <ResponseMetadata data-hook="chat-response-metadata">
            {responseMetadata}
          </ResponseMetadata>
        )}
      </ExplanationBox>
    )
  }

  return (
    <MessagesArea>
      <MessagesContainer
        ref={messagesContainerRef}
        $scrolled={scrolled}
        role="log"
        data-hook="chat-messages-container"
      >
        {notesAfter(null)}
        {visibleEntries.map((entry) => {
          const id =
            entry.type === "user" ? entry.message.id : entry.anchorMessage.id
          return (
            <React.Fragment key={`entry-${id}`}>
              {renderEntry(entry)}
              {notesAfter(id)}
            </React.Fragment>
          )
        })}
        <MessagesEnd ref={messagesEndRef} data-hook="messages-end" />
      </MessagesContainer>
      {showScrollToEnd && (
        <ScrollToEndButton
          variant="secondary"
          size="sm"
          prefixIcon={<ArrowDownIcon size={14} />}
          onClick={scrollToEnd}
          title={`Scroll to bottom (${SCROLL_TO_END_LABEL})`}
          dataHook="chat-scroll-to-end"
        >
          Scroll to bottom
          <ScrollToEndShortcut aria-hidden="true">
            {SCROLL_TO_END_KEYS.join(" ")}
          </ScrollToEndShortcut>
        </ScrollToEndButton>
      )}
    </MessagesArea>
  )
}
