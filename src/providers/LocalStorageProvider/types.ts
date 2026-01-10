export type ProviderSettings = {
  apiKey: string
  enabledModels: string[]
  grantSchemaAccess: boolean
}

export type CustomModelInfo = {
  id: string
  name: string
}

export type CustomProviderSettings = {
  name: string
  baseUrl: string
  apiKey: string
  apiKeyRequired: boolean
  enabledModels: string[]
  availableModels: CustomModelInfo[]
  grantSchemaAccess: boolean
}

export type AiAssistantSettings = {
  selectedModel?: string
  providers: {
    anthropic?: ProviderSettings
    openai?: ProviderSettings
  }
  customProviders?: Record<string, CustomProviderSettings>
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
