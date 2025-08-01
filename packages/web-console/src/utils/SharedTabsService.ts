import { makeBuffer } from "../store/buffers"
import type { Buffer, Metric } from "../store/buffers"
import type { RefreshRate, MetricViewMode, MetricType } from "../scenes/Editor/Metrics/utils"
import * as QuestDB from "./questdb"

export type BaseSharedTab = {
  id: string
  version: number
  name: string
  description?: string
  pinned: boolean
  deleted: boolean
}

export type SharedQueryTab = BaseSharedTab & {
  type: 'query'
}

export type SharedMetricsTab = BaseSharedTab & {
  type: 'metrics'
  refreshRate: RefreshRate
  dateFrom: string
  dateTo: string
  viewMode: MetricViewMode
}

export type SharedQueryTabWithContent = SharedQueryTab & {
  queries: SharedQuery[]
}

export type SharedMetricsTabWithContent = SharedMetricsTab & {
  metrics: SharedMetric[]
}

export type SharedTabWithContent = SharedQueryTabWithContent | SharedMetricsTabWithContent

export type SharedQuery = {
  tabId: string
  version: number
  name?: string
  query: string
}

export type SharedMetric = {
  tabId: string
  version: number
  metricType: MetricType
  tableId?: number
  position: number
  removed: boolean
}

export type SaveSharedTabResult = { success: true } | { success: false, error: string, updatedSharedTab?: SharedTabWithContent }

class SharedTabsService {
  static instance: SharedTabsService | null = null
    
  private client: QuestDB.Client

  constructor(client: QuestDB.Client) {
    this.client = client
    if (SharedTabsService.instance) {
      return SharedTabsService.instance
    }
    SharedTabsService.instance = this
  }

  public async init() {
    try {
      // Create shared_tabs table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS shared_tabs (
          id UUID,
          version INT,
          name STRING,
          description STRING,
          type SYMBOL,
          refreshRate STRING,
          dateFrom STRING,
          dateTo STRING,
          viewMode STRING,
          pinned BOOLEAN,
          deleted BOOLEAN
        )
      `)

      // Create shared_queries table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS shared_queries (
          tabId UUID,
          version INT,
          name STRING,
          query STRING
        )
      `)

      // Create shared_metrics table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS shared_metrics (
          tabId UUID,
          version INT,
          tableId INT,
          metricType SYMBOL
        )
      `)
    } catch (error) {
      console.error('Failed to initialize shared tabs tables:', error)
    }
  }

  public createBufferFromSharedTab(sharedTab: SharedTabWithContent): Buffer {
    const { name, description, type, pinned } = sharedTab
    let content = ""

    if (type === "query") {
      if (description) {
        content += `-- ${description}\n\n`
      }
      const { queries } = sharedTab
      queries.forEach((query) => {
        content += query.name ? `-- ${query.name}\n${query.query}\n\n` : `${query.query}\n\n`
      })

      return makeBuffer({
        label: name,
        value: content,
        position: 0,
        archived: false,
        archivedAt: 0,
        externalId: sharedTab.id,
        version: sharedTab.version,
      })
    }


    return makeBuffer({ 
      label: name,
      value: "",
      position: 0,
      archived: false,
      archivedAt: 0,
      externalId: sharedTab.id,
      version: sharedTab.version,
      metricsViewState: {
        dateFrom: sharedTab.dateFrom,
        dateTo: sharedTab.dateTo,
        refreshRate: sharedTab.refreshRate,
        viewMode: sharedTab.viewMode,
        metrics: sharedTab.metrics.map(metric => ({
          ...metric,
          color: '#FF6B6B',
        })),
      },
    })
  }

  public createSharedTabFromBuffer(buffer: Buffer, queries: { name: string, query: string }[]): SharedTabWithContent {
    const id = (crypto as unknown as { randomUUID: () => string }).randomUUID()

    if (buffer.metricsViewState) {
      const metrics = buffer.metricsViewState.metrics
      return {
        id,
        version: 1,
        name: buffer.label,
        pinned: false,
        type: "metrics",
        refreshRate: buffer.metricsViewState.refreshRate!,
        dateFrom: buffer.metricsViewState.dateFrom!,
        dateTo: buffer.metricsViewState.dateTo!,
        viewMode: buffer.metricsViewState.viewMode!,
        metrics: metrics?.map(m => ({
          ...m,
          tabId: id,
          version: 1,
        })) ?? [],
        deleted: false,
      }
    }

    return {
      id,
      version: 1,
      name: buffer.label,
      pinned: false,
      type: "query",
      queries: queries.map(q => ({
        tabId: id,
        version: 1,
        name: "",
        query: q.query,
      })),
      deleted: false,
    }
  }

  public async getSharedTab(id: string): Promise<SharedTabWithContent | null> {
    try {
      const tabResult = await this.client.query<SharedQueryTab | SharedMetricsTab>(`
        SELECT *
        FROM shared_tabs 
        WHERE id = '${id}' 
        ORDER BY version DESC 
        LIMIT 1
      `)

      if (tabResult.type !== QuestDB.Type.DQL || tabResult.data.length === 0) {
        return null
      }

      const tab = tabResult.data[0]

      if (tab.deleted) {
        return null
      }

      if (tab.type === 'query') {
        const queriesResult = await this.client.query<{ name: string, query: string }>(`
          SELECT name, query FROM shared_queries WHERE tabId = '${id}' AND version = ${tab.version}
        `)

        const queries = queriesResult.type === QuestDB.Type.DQL ? 
          queriesResult.data.map(q => ({
            tabId: id,
            version: tab.version,
            name: q.name || '',
            query: q.query
          })) : []

        return {
          ...tab,
          queries
        }
      } else {
        const metricsResult = await this.client.query<{ tableId: number | null, metricType: string }>(`
          SELECT tableId, metricType FROM shared_metrics WHERE tabId = '${id}' AND version = ${tab.version}
        `)

        const metrics = metricsResult.type === QuestDB.Type.DQL ? 
          metricsResult.data.map((m, index) => ({
            tabId: id,
            version: tab.version,
            metricType: m.metricType as MetricType,
            tableId: m.tableId ?? undefined,
            position: index,
            removed: false
          })) : []

        return {
          ...tab,
          metrics
        }
      }
    } catch (e) {
      console.error('Failed to get shared tab:', e)
      return null
    }
  }

  public async saveSharedTab(newSharedTab: SharedTabWithContent): Promise<SaveSharedTabResult> {
    const { version } = newSharedTab

    if (version === 1) {
      return this.createSharedTab(newSharedTab)
    } else {
      return this.updateSharedTab(newSharedTab)
    }
  }

  public async createSharedTab(newSharedTab: SharedTabWithContent): Promise<SaveSharedTabResult> {
    const { id, version } = newSharedTab

    // Check for duplicate names
    try {
      const existingTabsResult = await this.client.query<{ name: string, deleted: boolean }>(`
        SELECT name, deleted FROM shared_tabs WHERE name = '${newSharedTab.name.replace(/'/g, "''")}'
      `)
      if (existingTabsResult.type === QuestDB.Type.DQL && existingTabsResult.data.length > 0 && existingTabsResult.data.some(d => !d.deleted)) {
        return { success: false, error: "Tab name already exists" }
      }
    } catch (e) {
      return { success: false, error: "Failed to check if tab name already exists" }
    }

    // Insert new shared tab
    try {
      const insertTabQuery = `
        INSERT INTO shared_tabs (id, version, name, description, type, refreshRate, dateFrom, dateTo, viewMode, pinned, deleted) 
        VALUES (
          '${id}', 
          ${version}, 
          '${newSharedTab.name.replace(/'/g, "''")}', 
          '${(newSharedTab.description || '').replace(/'/g, "''")}',
          '${newSharedTab.type}',
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.refreshRate}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.dateFrom}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.dateTo}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.viewMode}'` : 'null'},
          ${newSharedTab.pinned},
          false
        )
      `
      
      const result = await this.client.query(insertTabQuery)
      if (result.type !== QuestDB.Type.DML) {
        return { success: false, error: "Failed to create shared tab" }
      }

      // Insert queries or metrics based on type
      if (newSharedTab.type === 'query') {
        for (const query of newSharedTab.queries) {
          await this.client.query(`
            INSERT INTO shared_queries (tabId, version, name, query) 
            VALUES (
              '${query.tabId}', 
              ${query.version}, 
              '${(query.name || '').replace(/'/g, "''")}', 
              '${query.query.replace(/'/g, "''")}'
            )
          `)
        }
      } else {
        for (const metric of newSharedTab.metrics) {
          await this.client.query(`
            INSERT INTO shared_metrics (tabId, version, tableId, metricType) 
            VALUES (
              '${metric.tabId}', 
              ${metric.version}, 
              ${metric.tableId ?? 'null'}, 
              '${metric.metricType}'
            )
          `)
        }
      }

      return { success: true }
    } catch (e) {
      return { success: false, error: "Failed to create shared tab" }
    }
  }

  public async updateSharedTab(newSharedTab: SharedTabWithContent): Promise<SaveSharedTabResult> {
    const { id, version } = newSharedTab

    try {
      const latestVersionResult = await this.client.query<SharedQueryTab | SharedMetricsTab>(`
        SELECT *
        FROM shared_tabs 
        WHERE id = '${id}' 
        ORDER BY version DESC 
        LIMIT 1
      `)

      if (latestVersionResult.type !== QuestDB.Type.DQL || latestVersionResult.data.length === 0) {
        return { success: false, error: "Shared tab not found" }
      }

      const latestTab = latestVersionResult.data[0]

      if (latestTab.deleted) {
        return { success: false, error: "Shared tab is deleted" }
      }
      
      if (version <= latestTab.version) {
        const existingTab = await this.getSharedTab(id)
        if (!existingTab) {
          return { success: false, error: "Failed to retrieve existing shared tab" }
        }

        return { success: false, error: "Shared tab is updated by another user", updatedSharedTab: existingTab }
      }

      const insertTabQuery = `
        INSERT INTO shared_tabs (id, version, name, description, type, refreshRate, dateFrom, dateTo, viewMode, pinned, deleted) 
        VALUES (
          '${id}', 
          ${version}, 
          '${newSharedTab.name.replace(/'/g, "''")}', 
          '${(newSharedTab.description || '').replace(/'/g, "''")}',
          '${newSharedTab.type}',
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.refreshRate}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.dateFrom}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.dateTo}'` : 'null'},
          ${newSharedTab.type === 'metrics' ? `'${newSharedTab.viewMode}'` : 'null'},
          ${newSharedTab.pinned},
          false
        )
      `
      
      const result = await this.client.query(insertTabQuery)
      if (result.type !== QuestDB.Type.DML) {
        return { success: false, error: "Failed to update shared tab" }
      }

      if (newSharedTab.type === 'query') {
        for (const query of newSharedTab.queries) {
          await this.client.query(`
            INSERT INTO shared_queries (tabId, version, name, query) 
            VALUES (
              '${query.tabId}', 
              ${query.version}, 
              '${(query.name || '').replace(/'/g, "''")}', 
              '${query.query.replace(/'/g, "''")}'
            )
          `)
        }
      } else {
        for (const metric of newSharedTab.metrics) {
          console.log({ metric })
          await this.client.query(`
            INSERT INTO shared_metrics (tabId, version, tableId, metricType) 
            VALUES (
              '${metric.tabId}', 
              ${metric.version}, 
              ${metric.tableId || 'null'}, 
              '${metric.metricType}'
            )
          `)
        }
      }

      return { success: true }
    } catch (e) {
      return { success: false, error: "Failed to update shared tab: " + (e as Error).message }
    }
  }

  public async deleteSharedTab(id: string): Promise<SaveSharedTabResult> {
    try {
      // Get the latest version of the tab
      const latestVersionResult = await this.client.query<SharedQueryTab | SharedMetricsTab>(`
        SELECT *
        FROM shared_tabs 
        WHERE id = '${id}' 
        ORDER BY version DESC 
        LIMIT 1
      `)

      if (latestVersionResult.type !== QuestDB.Type.DQL || latestVersionResult.data.length === 0) {
        return { success: false, error: "Shared tab not found" }
      }

      const latestTab = latestVersionResult.data[0]

      if (latestTab.deleted) {
        return { success: false, error: "Shared tab is already deleted" }
      }

      // Create a new version with deleted = true
      const newVersion = latestTab.version + 1
      const insertTabQuery = `
        INSERT INTO shared_tabs (id, version, name, description, type, refreshRate, dateFrom, dateTo, viewMode, pinned, deleted) 
        VALUES (
          '${id}', 
          ${newVersion}, 
          '${latestTab.name.replace(/'/g, "''")}', 
          '${(latestTab.description || '').replace(/'/g, "''")}',
          '${latestTab.type}',
          ${latestTab.type === 'metrics' ? `'${latestTab.refreshRate}'` : 'null'},
          ${latestTab.type === 'metrics' ? `'${latestTab.dateFrom}'` : 'null'},
          ${latestTab.type === 'metrics' ? `'${latestTab.dateTo}'` : 'null'},
          ${latestTab.type === 'metrics' ? `'${latestTab.viewMode}'` : 'null'},
          ${latestTab.pinned},
          true
        )
      `
      
      const result = await this.client.query(insertTabQuery)
      if (result.type !== QuestDB.Type.DML) {
        return { success: false, error: "Failed to delete shared tab" }
      }

      return { success: true }
    } catch (e) {
      return { success: false, error: "Failed to delete shared tab: " + (e as Error).message }
    }
  }

  public async getAllSharedTabs(): Promise<SharedTabWithContent[]> {
    try {
      // Get latest version of each tab that is not deleted
      const tabsResult = await this.client.query<SharedQueryTab | SharedMetricsTab>(`
        SELECT t1.*
        FROM shared_tabs t1
        INNER JOIN (
          SELECT id, MAX(version) as max_version
          FROM shared_tabs
          GROUP BY id
        ) t2 ON t1.id = t2.id AND t1.version = t2.max_version
        WHERE t1.deleted = false
        ORDER BY t1.name
      `)

      if (tabsResult.type !== QuestDB.Type.DQL) {
        return []
      }

      const sharedTabs: SharedTabWithContent[] = []

      for (const tab of tabsResult.data) {
        if (tab.type === 'query') {
          const queriesResult = await this.client.query<{ name: string, query: string }>(`
            SELECT name, query FROM shared_queries WHERE tabId = '${tab.id}' AND version = ${tab.version}
          `)

          const queries = queriesResult.type === QuestDB.Type.DQL ? 
            queriesResult.data.map(q => ({
              tabId: tab.id,
              version: tab.version,
              name: q.name || '',
              query: q.query
            })) : []

          sharedTabs.push({
            ...tab,
            queries
          })
        } else {
          const metricsResult = await this.client.query<{ tableId: number, metricType: string }>(`
            SELECT tableId, metricType FROM shared_metrics WHERE tabId = '${tab.id}' AND version = ${tab.version}
          `)

          const metrics = metricsResult.type === QuestDB.Type.DQL ? 
            metricsResult.data.map((m, index) => ({
              tabId: tab.id,
              version: tab.version,
              metricType: m.metricType as MetricType,
              tableId: m.tableId,
              position: index,
              removed: false
            })) : []

          sharedTabs.push({
            ...tab,
            metrics
          })
        }
      }

      return sharedTabs
    } catch (e) {
      console.error('Failed to get all shared tabs:', e)
      return []
    }
  }
}

export default SharedTabsService