import { describe, expect, it } from "vitest"
import { makeBuffer, type Buffer } from "../../store/buffers"
import type { ExampleDashboard } from "../../providers/SettingsProvider/types"
import {
  EXAMPLE_LINK_NOT_FOUND,
  planExampleStartup,
  readExampleLink,
  withoutTemplateParam,
  type ExampleStartup,
} from "./exampleLink"

const MAX_TABS = 100

const defaultExample: ExampleDashboard = {
  id: "default",
  title: "Default dashboard",
  path: "assets/link-default.json",
}
const linkedExample: ExampleDashboard = {
  id: "linked",
  title: "Linked dashboard",
  path: "assets/link-test.json",
}
const examples = [defaultExample, linkedExample]

let nextId = 1
const tab = (row: Partial<Buffer> = {}): Buffer => ({
  ...makeBuffer({ label: "SQL", position: 0, ...row }),
  id: row.id ?? nextId++,
})

const sqlTab = tab({ label: "My SQL", value: "select 42" })
const freshTab = tab({ label: "SQL" })
const notebook = { cells: [] }

type Case = {
  name: string
  search: string
  buffers?: Buffer[]
  config?: ExampleDashboard[]
  autoOpened?: boolean
  // The address bar after the link is consumed.
  search_after: string
  // The example file fetched while the workspace loads.
  fetched?: string
  plan: ExampleStartup | ((buffers: Buffer[]) => ExampleStartup)
}

const openLinked: ExampleStartup = {
  kind: "open",
  example: linkedExample,
  source: "link",
  markAutoOpened: false,
}
const stored: ExampleStartup = { kind: "stored", markAutoOpened: false }
const notFound: ExampleStartup = {
  kind: "stored",
  error: EXAMPLE_LINK_NOT_FOUND,
  markAutoOpened: false,
}

const cases: Case[] = [
  {
    name: "template only",
    search: "?templateId=linked",
    search_after: "",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps a parameter after the template",
    search: "?templateId=linked&keep=yes",
    search_after: "?keep=yes",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps a parameter before the template",
    search: "?keep=yes&templateId=linked",
    search_after: "?keep=yes",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps the order of parameters around the template",
    search: "?a=1&templateId=linked&b=2",
    search_after: "?a=1&b=2",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps encoded values of other parameters",
    search: "?templateId=linked&title=My%20dashboard&sum=a%2Bb",
    search_after: "?title=My+dashboard&sum=a%2Bb",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "uses the first of repeated templates and consumes them all",
    search: "?templateId=linked&templateId=default",
    search_after: "",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps other parameters with empty values",
    search: "?templateId=linked&a=&b=",
    search_after: "?a=&b=",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps the stored tab without parameters",
    search: "",
    search_after: "",
    plan: stored,
  },
  {
    name: "keeps the stored tab for unrelated parameters",
    search: "?keep=yes",
    search_after: "?keep=yes",
    plan: stored,
  },
  {
    name: "keeps the stored tab for an empty template",
    search: "?templateId=&keep=yes",
    search_after: "?keep=yes",
    plan: stored,
  },
  {
    name: "reports a template that is not configured",
    search: "?templateId=missing&keep=yes",
    search_after: "?keep=yes",
    plan: notFound,
  },
  {
    name: "matches template ids case-sensitively",
    search: "?templateId=Linked",
    search_after: "",
    plan: notFound,
  },
  {
    name: "does not repeat the link text in the error",
    search: "?templateId=x%22.%20Your%20session%20expired",
    search_after: "",
    plan: notFound,
  },
  {
    name: "ignores a template on a deployment without examples",
    search: "?templateId=linked&keep=yes",
    config: [],
    search_after: "?keep=yes",
    plan: stored,
  },
  {
    name: "opens the requested example instead of the default on a fresh workspace",
    search: "?templateId=linked&keep=yes",
    buffers: [freshTab],
    autoOpened: false,
    search_after: "?keep=yes",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "auto-opens the default example on a first visit without a template",
    search: "?keep=yes",
    buffers: [freshTab],
    autoOpened: false,
    search_after: "?keep=yes",
    fetched: "default",
    plan: {
      kind: "open",
      example: defaultExample,
      source: "automatic",
      markAutoOpened: true,
    },
  },
  {
    name: "uses up the automatic opening for a visitor who already has tabs",
    search: "",
    autoOpened: false,
    search_after: "",
    fetched: "default",
    plan: { kind: "stored", markAutoOpened: true },
  },
  {
    name: "does not auto-open twice in the same browser",
    search: "",
    buffers: [freshTab],
    autoOpened: true,
    search_after: "",
    plan: stored,
  },
  {
    name: "reuses an open copy of the example",
    search: "?templateId=linked&keep=yes",
    buffers: [
      sqlTab,
      tab({ templateId: "linked", notebookViewState: notebook }),
    ],
    search_after: "?keep=yes",
    fetched: "linked",
    plan: (buffers) => ({
      kind: "reuse",
      buffer: buffers[1],
      example: linkedExample,
    }),
  },
  {
    name: "opens the configured example beside a monitoring dashboard with the same template id",
    search: "?templateId=monitoring%3Atable",
    config: [{ ...linkedExample, id: "monitoring:table" }],
    buffers: [
      sqlTab,
      tab({
        templateId: "monitoring:table",
        monitoring: { target: { name: "trades", kind: "table" } },
        notebookViewState: notebook,
      }),
    ],
    search_after: "",
    fetched: "monitoring:table",
    plan: {
      kind: "open",
      example: { ...linkedExample, id: "monitoring:table" },
      source: "link",
      markAutoOpened: false,
    },
  },
  {
    name: "opens a new copy next to an archived one",
    search: "?templateId=linked&keep=yes",
    buffers: [
      sqlTab,
      tab({
        templateId: "linked",
        archived: true,
        archivedAt: 1,
        notebookViewState: notebook,
      }),
    ],
    search_after: "?keep=yes",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "opens a new copy instead of reusing a previewed one",
    search: "?templateId=linked",
    buffers: [
      sqlTab,
      tab({
        templateId: "linked",
        isTemporary: true,
        notebookViewState: notebook,
      }),
    ],
    search_after: "",
    fetched: "linked",
    plan: openLinked,
  },
  {
    name: "keeps the stored tab at the tab limit",
    search: "?templateId=linked",
    buffers: Array.from({ length: MAX_TABS }, () => tab()),
    search_after: "",
    fetched: "linked",
    plan: {
      kind: "stored",
      error: `Tab limit reached (${MAX_TABS}). Delete closed tabs from the Tabs panel to free up space.`,
      markAutoOpened: false,
    },
  },
  {
    name: "gives a SQL share link priority",
    search: "?templateId=linked&keep=yes&query=select+7654321",
    buffers: [freshTab],
    autoOpened: false,
    search_after: "?keep=yes&query=select+7654321",
    plan: stored,
  },
  {
    name: "gives an executing SQL share link priority",
    search:
      "?templateId=linked&keep=yes&query=select+7654321&executeQuery=true",
    buffers: [freshTab],
    autoOpened: false,
    search_after: "?keep=yes&query=select+7654321&executeQuery=true",
    plan: stored,
  },
  {
    name: "does not reopen after the consumed link is refreshed",
    search: "?keep=yes",
    buffers: [
      sqlTab,
      tab({ templateId: "linked", notebookViewState: notebook }),
    ],
    search_after: "?keep=yes",
    plan: stored,
  },
]

describe("example links", () => {
  it.each(cases)(
    "$name",
    ({
      search,
      buffers = [sqlTab],
      config = examples,
      autoOpened = true,
      search_after,
      fetched,
      plan,
    }) => {
      // Given a link and a deployment's examples
      const link = readExampleLink({
        search,
        consoleConfig: { exampleDashboards: config },
        autoOpened,
      })

      // Then only templateId is consumed, and the right file is fetched
      expect(link.search).toBe(search_after)
      expect(link.fetchExample?.id).toBe(fetched)

      // And the stored tabs decide what the first load does
      expect(planExampleStartup(link, buffers, MAX_TABS)).toEqual(
        typeof plan === "function" ? plan(buffers) : plan,
      )
    },
  )
})

describe("withoutTemplateParam", () => {
  it("returns the search untouched when there is no template", () => {
    expect(withoutTemplateParam("?a=1&b=%20")).toBe("?a=1&b=%20")
  })
})

describe("malformed example lists", () => {
  it.each([{}, "x", 5, true])(
    "treat exampleDashboards: %j as a regular console",
    (exampleDashboards) => {
      // Given a console-configuration.json whose example list is not an array
      const consoleConfig = {
        exampleDashboards: exampleDashboards as unknown as ExampleDashboard[],
      }

      // When a page loads, with or without a template link
      const plain = readExampleLink({
        search: "",
        consoleConfig,
        autoOpened: false,
      })
      const linked = readExampleLink({
        search: "?templateId=linked",
        consoleConfig,
        autoOpened: false,
      })

      // Then nothing is fetched and the stored tab opens
      expect(plain.fetchExample).toBeUndefined()
      expect(planExampleStartup(plain, [sqlTab], MAX_TABS)).toEqual(stored)
      expect(linked.fetchExample).toBeUndefined()
      expect(planExampleStartup(linked, [sqlTab], MAX_TABS)).toEqual(stored)
    },
  )
})
