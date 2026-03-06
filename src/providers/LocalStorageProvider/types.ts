export type ProviderSettings = {
  apiKey: string
  enabledModels: string[]
  grantSchemaAccess: boolean
}

export type CustomProviderDefinition = {
  type: "anthropic" | "openai" | "openai-chat-completions"
  name: string
  baseURL: string
  apiKey?: string
  contextWindow: number
  testModel?: string
  models: string[]
  grantSchemaAccess?: boolean
}

export type AiAssistantSettings = {
  selectedModel?: string
  providers: Partial<Record<string, ProviderSettings>>
  customProviders?: Record<string, CustomProviderDefinition>
}

export type SettingsType = string | boolean | number | AiAssistantSettings

export enum LeftPanelType {
  DATASOURCES = "datasources",
  SEARCH = "search",
}

export type LeftPanelState = {
  type: LeftPanelType | null
  width: number
}

export type LocalConfig = {
  editorCol: number
  editorLine: number
  editorSplitterBasis: number
  resultsSplitterBasis: number
  exampleQueriesVisited: boolean
  autoRefreshTables: boolean
  leftPanelState: LeftPanelState
  aiAssistantSettings: AiAssistantSettings
  aiChatPanelWidth: number
}
