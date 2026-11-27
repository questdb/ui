import type { Buffer } from "../../store/buffers"
import type {
  ConsoleConfig,
  ExampleDashboard,
} from "../../providers/SettingsProvider/types"
import { isFreshWorkspace } from "./isFreshWorkspace"
import { hasExampleDashboards } from "./hasExampleDashboards"
import { exampleTemplateIdOf } from "./exampleIdentity"

const TEMPLATE_PARAM = "templateId"

export const EXAMPLE_LINK_NOT_FOUND =
  "The example dashboard in this link was not found."

// The search string after a template link is consumed: only `templateId` is
// removed, every other parameter keeps its value and order.
export const withoutTemplateParam = (search: string): string => {
  const params = new URLSearchParams(search)
  if (!params.has(TEMPLATE_PARAM)) return search
  params.delete(TEMPLATE_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}

export type ExampleLink = {
  // The `templateId` parameter, when present and non-empty, on a deployment
  // with examples. Elsewhere the parameter is ignored.
  templateId?: string
  // A SQL share link (`?query=`) takes priority over any example.
  hasQuery: boolean
  // The configured example the link names.
  linkedExample?: ExampleDashboard
  // The example to fetch while the workspace loads, if any: the linked one, or
  // the first one for a browser that has never had an example auto-opened.
  fetchExample?: ExampleDashboard
  // The search string once the link is consumed.
  search: string
}

// Reads a template link (`?templateId=<id>`) against the deployment's
// examples. Decided on the first render, before the stored tabs are read, so
// the example file can be fetched in parallel with IndexedDB.
export const readExampleLink = ({
  search,
  consoleConfig,
  autoOpened,
}: {
  search: string
  consoleConfig: Pick<ConsoleConfig, "exampleDashboards">
  // Whether this browser already had an example auto-opened once.
  autoOpened: boolean
}): ExampleLink => {
  const params = new URLSearchParams(search)
  const hasQuery = !!params.get("query")
  // Only a non-empty array configures examples; anything else (including a
  // malformed value) means a regular console.
  const examples = hasExampleDashboards(consoleConfig)
    ? consoleConfig.exampleDashboards
    : []
  const templateId =
    examples.length > 0 ? params.get(TEMPLATE_PARAM) || undefined : undefined
  const linkedExample = hasQuery
    ? undefined
    : examples.find((example) => example.id === templateId)
  const firstExample = examples[0]
  const fetchExample = hasQuery
    ? undefined
    : (linkedExample ?? (!templateId && !autoOpened ? firstExample : undefined))
  return {
    templateId,
    hasQuery,
    linkedExample,
    fetchExample,
    search: withoutTemplateParam(search),
  }
}

export type ExampleStartup =
  // Activate the stored tab. `error` is shown to the user; `markAutoOpened`
  // records that this browser's one automatic example opening is used up.
  | { kind: "stored"; error?: string; markAutoOpened: boolean }
  // Activate an already open copy of the linked example.
  | { kind: "reuse"; buffer: Buffer; example: ExampleDashboard }
  // Create a tab from the fetched example and activate it.
  | {
      kind: "open"
      example: ExampleDashboard
      source: "link" | "automatic"
      markAutoOpened: boolean
    }

// What the first load does with a template link, given the stored tabs.
export const planExampleStartup = (
  link: ExampleLink,
  buffers: Buffer[],
  maxTabs: number,
): ExampleStartup => {
  if (link.hasQuery) return { kind: "stored", markAutoOpened: false }
  if (link.templateId && !link.linkedExample) {
    // The link text is not repeated: anyone can write it.
    return {
      kind: "stored",
      error: EXAMPLE_LINK_NOT_FOUND,
      markAutoOpened: false,
    }
  }
  const { linkedExample, fetchExample } = link
  if (linkedExample) {
    const open = buffers.find(
      (buffer) =>
        exampleTemplateIdOf(buffer) === linkedExample.id &&
        !buffer.archived &&
        !buffer.isTemporary,
    )
    if (open) return { kind: "reuse", buffer: open, example: linkedExample }
    if (buffers.length >= maxTabs) {
      return {
        kind: "stored",
        error: `Tab limit reached (${maxTabs}). Delete closed tabs from the Tabs panel to free up space.`,
        markAutoOpened: false,
      }
    }
  }
  if (!fetchExample || (!linkedExample && !isFreshWorkspace(buffers))) {
    // A visitor who already has tabs keeps them: the example is never opened
    // for them, now or after they later empty the workspace, and later loads
    // skip the fetch.
    return {
      kind: "stored",
      markAutoOpened: !!fetchExample && !linkedExample,
    }
  }
  return {
    kind: "open",
    example: fetchExample,
    source: linkedExample ? "link" : "automatic",
    markAutoOpened: !linkedExample,
  }
}

// Removes `templateId` from the address bar, keeping the path, the other
// parameters and the hash.
export const clearExampleLinkParams = () => {
  const { pathname, search, hash } = window.location
  const next = withoutTemplateParam(search)
  if (next === search) return
  history.replaceState(null, "", pathname + next + hash)
}
