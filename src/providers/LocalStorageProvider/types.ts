export type AiAssistantSettings = {
  apiKey: string
  model: string
  grantSchemaAccess: boolean
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
