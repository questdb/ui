export type Settings = Partial<{
  "acl.oidc.enabled": boolean
  "acl.oidc.client.id": string
  "acl.oidc.host": string
  "acl.oidc.port": number
  "acl.oidc.tls.enabled": boolean
  "acl.oidc.authorization.endpoint": string
  "acl.oidc.token.endpoint": string
  "acl.oidc.pkce.required": boolean
  "acl.basic.auth.realm.enabled"?: boolean
  "questdb.type"?: "OSS" | "EE"
  "questdb.version"?: string
}>

export type Query = {
  name?: string
  value: string
}

export type QueryGroup = {
  title?: string
  description?: string
  queries: Query[]
}

export type ConsoleConfig = Partial<{
  githubBanner: boolean
  readOnly?: boolean
  savedQueries: Array<Query | QueryGroup>
}>
