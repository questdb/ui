export type ProviderSettings = {
  apiKey: string
  enabledModels: string[]
  grantSchemaAccess: boolean
}

export type AiAssistantSettings = {
  aiAssistantPromo: boolean
  selectedModel?: string
  providers: {
    anthropic?: ProviderSettings
    openai?: ProviderSettings
  }
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
}
