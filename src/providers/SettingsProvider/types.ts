import { ErrorTag } from "../../utils"
export type Settings = Partial<{
  "release.type": "OSS" | "EE"
  "release.version": string
  "http.settings.readonly": boolean
  "acl.enabled": boolean
  "acl.basic.auth.realm.enabled": boolean
  "acl.oidc.groups.encoded.in.token": boolean
  "acl.oidc.enabled": boolean
  "acl.oidc.client.id": string
  "acl.oidc.redirect.uri": string
  "acl.oidc.scope": string
  "acl.oidc.host": string
  "acl.oidc.port": number
  "acl.oidc.tls.enabled": boolean
  "acl.oidc.authorization.endpoint": string
  "acl.oidc.token.endpoint": string
  "acl.oidc.pkce.required": boolean
  "acl.oidc.state.required": boolean
  "posthog.enabled": boolean
  "posthog.api.key": string
}>

// A ready-made notebook listed in the Tabs panel's "Example dashboards"
// folder. `path` is fetched relative to the console root (like
// `assets/console-configuration.json`) and holds a tab export: either the
// console's export file or a plain array of tab rows, with one notebook tab.
// See hasExampleDashboards() for what the list switches on.
export type ExampleDashboard = {
  id: string
  title: string
  path: string
}

export type ConsoleConfig = Partial<{
  ctaBanner: boolean
  readOnly?: boolean
  // Ready-made notebooks listed first in the Tabs panel. A non-empty list also
  // switches the console into showcase mode: the Tabs panel opens on the first
  // visit, the other folders start collapsed and the notebook onboarding modal
  // stays away.
  exampleDashboards: ExampleDashboard[]
}>

export type Warning = {
  tag: ErrorTag
  warning: string
}
