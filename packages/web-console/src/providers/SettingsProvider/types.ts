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
