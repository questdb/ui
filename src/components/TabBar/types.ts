export type TabProperties = {
  id: string
  title: string
  active?: boolean
  faviconClass?: string
  className?: string
}

export type TabBarProps = {
  tabs: TabProperties[]
  darkMode?: boolean
  limit?: number
  onTabActive: (id: string) => void
  onTabClose: (id: string) => void
  onTabRename: (id: string, title: string) => void
  onTabReorder: (id: string, fromIndex: number, toIndex: number) => void
  onNewTab: () => void
}
