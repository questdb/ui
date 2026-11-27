import type { ConversationMessage } from "../providers/AIConversationProvider/types"
import type { ToolDiff } from "../providers/AIStatusProvider"
import type { AgentPromptImage } from "../utils/localAgent/protocol"
import {
  cutInlineImages,
  pasteInlineImages,
  type InlineImageCut,
} from "../utils/ai/inlineImages"

// What one of a message's steps showed of its tool: what it printed and the
// files it changed. The step is its index in the message's history.
export type StepToolContent = {
  step: number
  output?: string
  diffs?: ToolDiff[]
}

// A chat message's large payloads. The chat keeps them out of its compressed
// transcript, so that a save does not compress them again.
export type MessagePayloads = {
  // The images the user attached.
  images?: AgentPromptImage[]
  // The images an agent put in its reply, cut out of the message's content.
  contentImages?: InlineImageCut[]
  // What the tools of the message's steps printed and changed.
  toolContent?: StepToolContent[]
}

export type SplitMessage = {
  // The message as the compressed transcript keeps it.
  transcript: ConversationMessage
  // Null when the message has none.
  payloads: MessagePayloads | null
}

const cutToolContent = (
  message: ConversationMessage,
): [ConversationMessage, StepToolContent[]] => {
  const toolContent: StepToolContent[] = []
  const operationHistory = message.operationHistory?.map((entry, step) => {
    if (entry.args?.output === undefined && entry.args?.diffs === undefined)
      return entry
    const { output, diffs, ...args } = entry.args
    toolContent.push({
      step,
      ...(output !== undefined && { output }),
      ...(diffs !== undefined && { diffs }),
    })
    return { ...entry, args }
  })
  return toolContent.length > 0
    ? [{ ...message, operationHistory }, toolContent]
    : [message, toolContent]
}

export const splitMessagePayloads = (
  message: ConversationMessage,
): SplitMessage => {
  const payloads: MessagePayloads = {}
  let transcript = message
  if (transcript.images?.length) {
    const { images, ...rest } = transcript
    payloads.images = images
    transcript = rest
  }
  if (typeof transcript.content === "string") {
    const { text, cuts } = cutInlineImages(transcript.content)
    if (cuts.length > 0) {
      payloads.contentImages = cuts
      transcript = { ...transcript, content: text }
    }
  }
  const [withoutToolContent, toolContent] = cutToolContent(transcript)
  if (toolContent.length > 0) {
    payloads.toolContent = toolContent
    transcript = withoutToolContent
  }
  return {
    transcript,
    payloads: Object.keys(payloads).length > 0 ? payloads : null,
  }
}

// Puts a message's payloads back on its transcript form.
export const joinMessagePayloads = (
  transcript: ConversationMessage,
  { images, contentImages, toolContent }: MessagePayloads,
): ConversationMessage => {
  let message = transcript
  if (images) message = { ...message, images }
  if (contentImages && typeof message.content === "string") {
    message = {
      ...message,
      content: pasteInlineImages(message.content, contentImages),
    }
  }
  if (toolContent && message.operationHistory) {
    const operationHistory = [...message.operationHistory]
    for (const { step, ...content } of toolContent) {
      const entry = operationHistory[step]
      if (entry)
        operationHistory[step] = {
          ...entry,
          args: { ...entry.args, ...content },
        }
    }
    message = { ...message, operationHistory }
  }
  return message
}
