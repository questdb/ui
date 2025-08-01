import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { useEditor } from "../../../providers"
import {
  Trash,
  FolderOpen,
  Plus,
} from "@styled-icons/boxicons-regular"
import { InsertChart } from "@styled-icons/material"
import {
  Box,
  Button,
  Dialog,
} from "@questdb/react-components"
import { FileCode } from "@styled-icons/remix-line"
import { Text, PopperToggle } from "../../../components"
import { Form } from "../../../components/Form"
import { useFormContext } from "react-hook-form"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { toast } from "../../../components/Toast"
import Joi from "joi"
import type { Buffer } from "../../../store/buffers"
import { getQueriesInRange } from "./utils"
import type { SharedTabWithContent, SharedMetricsTabWithContent, SharedQueryTabWithContent, SaveSharedTabResult } from "../../../utils/SharedTabsService"
import { RefreshRate, MetricViewMode, MetricType } from "../Metrics/utils"
import { widgets } from "../Metrics/widgets"
import { DateTimePicker, InvalidDateTimeState } from "../Metrics/date-time-picker"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { QuestDBLanguageName } from "./utils"
import type { ErrorResult } from "../../../utils"
import SharedTabPicker from "../QueryPicker/SharedTabPicker"
import { color } from "../../../utils"
import { theme } from "../../../theme"
import { makeBuffer } from "../../../store/buffers"

const SharedTabsButton = styled(Button)`
  margin: 0 1rem;
  flex: 0 0 auto;
`

const DialogContent = styled(Dialog.Content)`
  max-width: 800px;
  max-height: 80vh;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
  padding: 2rem;

  & > .shared-tab-form {
    max-height: 100%;
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
  }
`

const QueryBuilder = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 8px;
  padding: 2rem;
  gap: 1.5rem;
  margin: 1.5rem 0;
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const TabSelectionItem = styled.div`
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 8px;
  margin: 1rem 0;
  cursor: pointer;
  background: ${({ theme }) => theme.color.backgroundLighter};
  
  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }
`

const sharedTabSchema = Joi.object({
  name: Joi.string().required().trim().min(1).messages({
    'string.empty': 'Tab name is required',
    'any.required': 'Tab name is required'
  }),
  description: Joi.string().allow('').trim(),
  refreshRate: Joi.string().valid(...Object.values(RefreshRate)),
  dateFrom: Joi.string().required().custom((value, helpers) => {
    // Check if there's an invalid date time state in the parent context
    const { invalidDateTimeState } = helpers.state.ancestors[0] || {}
    if (invalidDateTimeState) {
      return helpers.error('dateFrom.invalid', { message: invalidDateTimeState.error })
    }
    return value
  }).messages({
    'dateFrom.invalid': '{{#message}}'
  }),
  dateTo: Joi.string().required(),
  type: Joi.string().valid('query', 'metrics').required(),
  viewMode: Joi.string().valid(...Object.values(MetricViewMode)),
  queries: Joi.array().items(Joi.object({
    name: Joi.string().allow('').trim(),
    query: Joi.string().required().trim().min(1).messages({
      'string.empty': 'Query is required',
      'any.required': 'Query is required'
    })
  })),
  metrics: Joi.array().items(Joi.object({
    metricType: Joi.string().valid(...Object.values(MetricType)).required(),
    tableId: Joi.any().optional()
  })),
  invalidDateTimeState: Joi.any().optional()
}).pattern(
  /^(queries|metrics)\.\d+\.(name|query|metricType|tableId)$/,
  Joi.alternatives().try(
    Joi.string().allow(''),
    Joi.number(),
    Joi.string().valid(...Object.values(MetricType))
  )
)

const BlockTextWithMargin = styled(Text)`
  display: block;
  margin-bottom: 2rem;
`

const BlockText = styled(Text).attrs({ size: "md" })`
  display: block;
  margin-bottom: 1rem;
`

const MetricBuilder = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 8px;
  padding: 2rem;
  gap: 1.5rem;
  margin: 1.5rem 0;
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const DialogTitle = styled(Dialog.Title)`
  padding-left: 0;
  padding-top: 0;
  flex-shrink: 0;
`

const StyledInsertChart = styled(InsertChart)`
  color: ${color("cyan")};
`

const StyledFile = styled(FileCode)`
  color: ${color("foreground")};
`

const CategoryTitle = styled(Text).attrs({ size: "lg", color: "foreground" })`
  display: block;
  margin-bottom: 1rem;
`


const FormSubmitButton = ({ editMode }: { editMode?: boolean }) => {
  return (
    <Form.Submit
      //disabled={!formState.isValid || Object.keys(formState.errors).length > 0}
      //loading={formState.isSubmitting}
    >
      {editMode ? 'Apply changes' : 'Save Shared Tab'}
    </Form.Submit>
  )
}

const VirtualizedFormContent = ({ builderData }: { builderData: any }) => {
  const { watch, setValue, getValues, formState } = useFormContext()
  const queries = watch('queries') || []
  const metrics = watch('metrics') || []
  const tables = useSelector(selectors.query.getTables)
  const [dateError, setDateError] = useState<string | null>(null)
  const { setError: setFormError, clearErrors } = useFormContext()
  const [invalidDateTimeState, setInvalidDateTimeState] = useState<InvalidDateTimeState | null>(null)
  const datePickerRef = React.useRef<HTMLDivElement>(null)
  const virtuosoRef = React.useRef<VirtuosoHandle>(null)

  const addQuery = () => {
    const currentQueries = getValues('queries') || []
    setValue('queries', [...currentQueries, { name: '', query: '' }])
  }
  
  const removeQuery = (index: number) => {
    const currentQueries = getValues('queries') || []
    setValue('queries', currentQueries.filter((_: any, i: number) => i !== index))
  }
  
  const addMetric = () => {
    const currentMetrics = getValues('metrics') || []
    setValue('metrics', [...currentMetrics, {
      metricType: MetricType.WAL_TRANSACTION_THROUGHPUT,
      tableId: undefined
    }])
  }
  
  const removeMetric = (index: number) => {
    const currentMetrics = getValues('metrics') || []
    setValue('metrics', currentMetrics.filter((_: any, i: number) => i !== index))
  }
  
  const handleDateFromToChange = (dateFrom: string, dateTo: string, invalidState?: InvalidDateTimeState | null) => {
    if (invalidState) {
      setInvalidDateTimeState(invalidState)
      setValue('invalidDateTimeState', invalidState)
      setFormError('dateFrom', {
        type: 'manual',
        message: invalidState.error
      })
      setDateError(invalidState.error)
      return
    }
    setValue('dateFrom', dateFrom)
    setValue('dateTo', dateTo)
    setValue('invalidDateTimeState', null)
    setInvalidDateTimeState(null)
    setDateError(null)
    clearErrors('dateFrom')
  }

  const flattenedItems = React.useMemo(() => {
    const items: any[] = []
    
    items.push(
      { id: 'name', type: 'form-field', label: 'Tab Name', name: 'name', required: true, component: 'input', placeholder: 'Enter tab name' },
      { id: 'description', type: 'form-field', label: 'Description', name: 'description', component: 'textarea', placeholder: 'Enter tab description (optional)', rows: 3 }
    )
    
    if (builderData.type === 'metrics') {
      items.push(
        { 
          id: 'refreshRate', 
          type: 'form-field', 
          label: 'Refresh Rate', 
          name: 'refreshRate', 
          component: 'select',
          options: Object.values(RefreshRate).map((rate: any) => ({ label: `Refresh: ${rate}`, value: rate }))
        },
        { id: 'date-picker', type: 'date-picker' },
        { 
          id: 'viewMode', 
          type: 'form-field', 
          label: 'View Mode', 
          name: 'viewMode', 
          component: 'select',
          options: Object.values(MetricViewMode).map((mode: any) => ({ label: mode, value: mode }))
        },
        { id: 'metrics-header', type: 'section-header', text: 'Widgets' }
      )
      
      metrics.forEach((_: any, index: number) => {
        items.push({
          id: `metric-${index}`,
          type: 'metric-builder',
          index,
          canRemove: metrics.length > 1
        })
      })
      
      items.push({ id: 'add-metric', type: 'add-button', text: 'Add Widget', onClick: addMetric })
    } else {
      items.push({ id: 'queries-header', type: 'section-header', text: 'Queries' })
      
      queries.forEach((_: any, index: number) => {
        items.push({
          id: `query-${index}`,
          type: 'query-builder',
          index,
          canRemove: queries.length > 1
        })
      })
      
      items.push({ id: 'add-query', type: 'add-button', text: 'Add Query', onClick: addQuery })
    }
    
    return items
  }, [builderData.type, queries.length, metrics.length])
  
  const dateFrom = watch('dateFrom')
  const dateTo = watch('dateTo')
  
  // Scroll to date picker when it's the first error on form submission
  React.useEffect(() => {
    if (formState.errors && Object.keys(formState.errors).length > 0) {
      const firstErrorField = Object.keys(formState.errors)[0]
      const searchId = ["dateFrom", "dateTo"].includes(firstErrorField) ? "date-picker" : firstErrorField
      const index = flattenedItems.findIndex(item => item.id === searchId)
      if (index !== -1) {
        virtuosoRef.current?.scrollIntoView({ index })
      }
    }
  }, [formState.errors, formState.submitCount])
  
  return (
    <Virtuoso
      ref={virtuosoRef}
      totalCount={flattenedItems.length}
      style={{ height: 400 }}
      itemContent={(index) => {
        const item = flattenedItems[index]
        
        switch (item.type) {
          case 'form-field':
            return (
              <div key={item.id} style={{ padding: '1rem 0', borderBottom: '1px solid #333' }}>
                <Form.Item name={item.name} label={item.label} required={item.required}>
                  {item.component === 'input' && <Form.Input name={item.name} placeholder={item.placeholder} />}
                  {item.component === 'textarea' && <Form.TextArea name={item.name} placeholder={item.placeholder} rows={item.rows} />}
                  {item.component === 'select' && <Form.Select name={item.name} options={item.options || []} />}
                </Form.Item>
              </div>
            )
            
          case 'query-builder':
            return (
              <QueryBuilder key={item.id}>
                <Form.Item name={`queries.${item.index}.name`} label="Query Name">
                  <Form.Input
                    name={`queries.${item.index}.name`}
                    placeholder="Query name (optional)"
                  />
                </Form.Item>
                
                <Form.Item name={`queries.${item.index}.query`} label="SQL Query" required>
                  <Form.TextArea
                    name={`queries.${item.index}.query`}
                    placeholder="Enter SQL query"
                    rows={3}
                  />
                </Form.Item>
                <Box alignSelf="flex-end">
                  {item.canRemove && (
                    <Button
                      skin="error"
                      type="button"
                      onClick={() => removeQuery(item.index)}
                      prefixIcon={<Trash size="16px" />}
                    >
                      Remove
                    </Button>
                  )}
                </Box>
              </QueryBuilder>
            )
            
          case 'metric-builder':
            return (
              <MetricBuilder key={item.id}>
                <Form.Item name={`metrics.${item.index}.metricType`} label="Widget Type" required>
                  <Form.Select
                    name={`metrics.${item.index}.metricType`}
                    options={Object.values(MetricType).map((type) => ({
                      label: widgets[type].label,
                      value: type,
                    }))}
                  />
                </Form.Item>
                
                <Form.Item name={`metrics.${item.index}.tableId`} label="Table">
                  <Form.Select
                    name={`metrics.${item.index}.tableId`}
                    options={[
                      { label: 'Select table...', value: '' },
                      ...tables.map((table: any) => ({
                        label: table.table_name,
                        value: table.id.toString(),
                        disabled: !table.walEnabled,
                      }))
                    ]}
                  />
                </Form.Item>
                
                {item.canRemove && (
                  <Box alignSelf="flex-end">
                    <Button
                      skin="error"
                      type="button"
                      onClick={() => removeMetric(item.index)}
                      prefixIcon={<Trash size="16px" />}
                    >
                      Remove
                    </Button>
                  </Box>
                )}
              </MetricBuilder>
            )
            
          case 'add-button':
            return (
              <Box key={item.id} align="center" justifyContent="space-between" style={{ padding: '1rem 0' }}>
                <Button type="button" skin="secondary" onClick={item.onClick} prefixIcon={<Plus size="16px" />}>
                  {item.text}
                </Button>
              </Box>
            )
            
          case 'date-picker':
            return (
              <div key={item.id} ref={datePickerRef} style={{ padding: '1rem 0', borderBottom: '1px solid #333' }}>
                <BlockText color="foreground">Date Range</BlockText>
                <DateTimePicker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFromToChange={handleDateFromToChange}
                  as="inline"
                  invalidState={invalidDateTimeState}
                />
                {dateError && <div style={{ marginTop: '0.5rem', color: theme.color.red }}>{dateError}</div>}
              </div>
            )
            
          case 'section-header':
            return (
              <div key={item.id} style={{ padding: '1rem 0' }}>
                <Text size="lg" color="foreground">{item.text}</Text>
              </div>
            )
            
          default:
            return null
        }
      }}
    />
  )
}

const formatErrorMessage = (error: unknown, context?: string): string => {
  const prefix = context ? `${context}: ` : ""
  
  // Handle QuestDB ErrorResult type
  if (error && typeof error === 'object' && 'error' in error && typeof (error as any).error === 'string') {
    return `${prefix}${(error as ErrorResult).error}`
  }
  
  // Handle SaveSharedTabResult error type
  if (error && typeof error === 'object' && 'success' in error && !(error as any).success && 'error' in error) {
    return `${prefix}${(error as SaveSharedTabResult & { success: false }).error}`
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    return `${prefix}${error.message}`
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return `${prefix}${error}`
  }
  
  // Handle other object types by trying to extract meaningful information
  if (error && typeof error === 'object') {
    // Try common error properties
    if ('message' in error && typeof (error as any).message === 'string') {
      return `${prefix}${(error as any).message}`
    }
    
    // Last resort: convert to string but avoid [object Object]
    try {
      const errorStr = JSON.stringify(error)
      if (errorStr !== '{}') {
        return `${prefix}${errorStr}`
      }
    } catch {
      // JSON.stringify failed, fall through to default
    }
  }
  
  // Default fallback
  return `${prefix}An unexpected error occurred`
}

export const SharedTabs = () => {
  const {
    buffers,
    sharedTabsService,
    editorRef,
    monacoRef,
  } = useEditor()
  
  const [sharedTabsPopperActive, setSharedTabsPopperActive] = useState(false)
  const [sharedTabs, setSharedTabs] = useState<SharedTabWithContent[]>([])
  const [categorySelectionOpen, setCategorySelectionOpen] = useState(false)
  const [tabSelectionOpen, setTabSelectionOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [tabToDelete, setTabToDelete] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [selectedBuffer, setSelectedBuffer] = useState<Buffer | null>(null)
  const [builderData, setBuilderData] = useState({
    name: '',
    description: '',
    type: 'query' as 'query' | 'metrics',
    queries: [{ name: '', query: '' }],
    // Metrics-specific fields
    refreshRate: RefreshRate.AUTO as RefreshRate,
    dateFrom: "now-1h",
    dateTo: "now",
    viewMode: MetricViewMode.GRID as MetricViewMode,
    metrics: [] as Array<{
      metricType: MetricType,
      tableId?: number
    }>,
    invalidDateTimeState: null as InvalidDateTimeState | null
  })

  // Load shared tabs when popper opens
  useEffect(() => {
    if (sharedTabsPopperActive) {
      loadSharedTabs()
    }
  }, [sharedTabsPopperActive])

  const loadSharedTabs = async () => {
    if (!sharedTabsService) return
    try {
      const tabs = await sharedTabsService.getAllSharedTabs()
      setSharedTabs(tabs)
    } catch (error) {
      console.error('Error loading shared tabs:', error)
      toast.error(formatErrorMessage(error, "Failed to load shared tabs"))
    }
  }

  const handleSharedTabsToggle = () => {
    setSharedTabsPopperActive(!sharedTabsPopperActive)
  }

  const handleHidePicker = () => {
    setSharedTabsPopperActive(false)
  }

  const openCategorySelection = () => {
    setCategorySelectionOpen(true)
  }

  const openTabSelection = () => {
    setTabSelectionOpen(true)
  }

  const selectBufferForBuilder = (buffer: Buffer) => {
    setSelectedBuffer(buffer)
    setTabSelectionOpen(false)
    setCategorySelectionOpen(false)
    
    if (buffer.metricsViewState) {
      setBuilderData({
        name: buffer.label,
        description: '',
        type: 'metrics',
        queries: [],
        refreshRate: buffer.metricsViewState.refreshRate || RefreshRate.AUTO,
        dateFrom: buffer.metricsViewState.dateFrom || "now-1h",
        dateTo: buffer.metricsViewState.dateTo || "now",
        viewMode: buffer.metricsViewState.viewMode || MetricViewMode.GRID,
        metrics: buffer.metricsViewState.metrics?.filter(m => !m.removed).map((metric) => ({
          metricType: metric.metricType,
          tableId: metric.tableId
        })) || [],
        invalidDateTimeState: null
      })
    } else {
      let queries = [{ name: '', query: '' }]
      
      if (buffer.value) {
        if (editorRef.current && monacoRef.current) {
          try {
            const text = editorRef.current.getValue({ preserveBOM: false, lineEnding: "\n" })
            const model = monacoRef.current.editor.createModel(text, QuestDBLanguageName)
            const lastLineNumber = model.getLineCount()
            const lastLineContent = model.getLineContent(lastLineNumber)
            const lastPosition = {
              lineNumber: lastLineNumber,
              column: lastLineContent.length,
            }
            const allQueries = getQueriesInRange(text, { lineNumber: 1, column: 1 }, lastPosition)
            if (allQueries.length > 0) {
              queries = allQueries.map((queryObj) => ({
                name: '',
                query: queryObj.query.trim()
              }))
            } else {
              queries = [{ name: '', query: buffer.value.trim() }]
            }
          } catch (error) {
            queries = [{ name: '', query: buffer.value.trim() }]
          }
        } else {
          const queriesText = buffer.value.split(';')
            .map(q => q.trim())
            .filter(q => q.length > 0)
          
          queries = queriesText.length > 0 
            ? queriesText.map(query => ({ name: '', query }))
            : [{ name: '', query: buffer.value.trim() }]
        }
      }
      
      setBuilderData({
        name: buffer.label,
        description: '',
        type: 'query',
        queries,
        refreshRate: RefreshRate.AUTO,
        dateFrom: "now-1h",
        dateTo: "now",
        viewMode: MetricViewMode.GRID,
        metrics: [],
        invalidDateTimeState: null
      })
    }
    
    setBuilderOpen(true)
  }

  const createNewQueryTab = () => {
    selectBufferForBuilder(makeBuffer({
      label: "Shared queries",
      value: "",
      position: 0,
      archived: false
    }))
  }

  const createNewWidgetTab = () => {
    const templateBuffer = makeBuffer({
      label: "Shared widgets",
      value: "",
      position: 0,
      archived: false,
      metricsViewState: {
        refreshRate: RefreshRate.AUTO,
        dateFrom: "now-1h",
        dateTo: "now",
        viewMode: MetricViewMode.GRID,
        metrics: [{
          metricType: MetricType.WAL_TRANSACTION_THROUGHPUT,
          position: 0,
          removed: false,
          color: '#FF6B6B'
        }]
      }
    })
    selectBufferForBuilder(templateBuffer)
  }

  const populateFormFromSharedTab = (sharedTab: SharedTabWithContent) => {
    if (sharedTab.type === 'metrics') {
      setBuilderData({
        name: sharedTab.name,
        description: sharedTab.description || '',
        type: 'metrics',
        queries: [],
        refreshRate: (sharedTab as any).refreshRate || RefreshRate.AUTO,
        dateFrom: (sharedTab as any).dateFrom || "now-1h",
        dateTo: (sharedTab as any).dateTo || "now",
        viewMode: (sharedTab as any).viewMode || MetricViewMode.GRID,
        metrics: sharedTab.metrics?.map((metric) => ({
          metricType: metric.metricType,
          tableId: metric.tableId
        })) || [],
        invalidDateTimeState: null
      })
    } else {
      setBuilderData({
        name: sharedTab.name,
        description: sharedTab.description || '',
        type: 'query',
        queries: sharedTab.queries?.map((query) => ({
          name: query.name || '',
          query: query.query
        })) || [{ name: '', query: '' }],
        refreshRate: RefreshRate.AUTO,
        dateFrom: "now-1h",
        dateTo: "now",
        viewMode: MetricViewMode.GRID,
        metrics: [],
        invalidDateTimeState: null
      })
    }
  }

  const handleEditTab = (tabId: string) => {
    const tabToEdit = sharedTabs.find(tab => tab.id === tabId)
    if (!tabToEdit) return
    
    // Populate form data from the shared tab
    populateFormFromSharedTab(tabToEdit)
    setEditMode(true)
    setEditingTabId(tabId)
    setBuilderOpen(true)
  }

  const handleDeleteTab = (tabId: string) => {
    setTabToDelete(tabId)
    //handleHidePicker()
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteTab = async () => {
    if (!sharedTabsService || !tabToDelete) return
    
    try {
      const result = await sharedTabsService.deleteSharedTab(tabToDelete)
      
      if (result.success) {
        toast.success("Shared tab deleted successfully")
        if (sharedTabsPopperActive) {
          loadSharedTabs()
        }
      } else {
        toast.error(formatErrorMessage(result, "Failed to delete shared tab"))
      }
    } catch (error) {
      console.error('Error deleting shared tab:', error)
      toast.error(formatErrorMessage(error, "Failed to delete shared tab"))
    } finally {
      setDeleteConfirmOpen(false)
      setTabToDelete(null)
    }
  }

  const handleBuilderSave = async (formData: typeof builderData) => {
    if (!sharedTabsService) return

    if (editMode && editingTabId) {
      await handleUpdateSharedTab(formData)
    } else {
      if (!selectedBuffer) return
      await handleCreateSharedTab(formData)
    }
  }

  const handleCreateSharedTab = async (formData: typeof builderData) => {
    if (!sharedTabsService || !selectedBuffer) return
    
    try {
      const modifiedBuffer: Buffer = { ...selectedBuffer }
      
      if (formData.type === 'metrics') {
        modifiedBuffer.metricsViewState = {
          ...selectedBuffer.metricsViewState,
          refreshRate: formData.refreshRate,
          dateFrom: formData.dateFrom,
          dateTo: formData.dateTo,
          viewMode: formData.viewMode,
          metrics: formData.metrics.map((metric, index) => ({
            metricType: metric.metricType,
            tableId: metric.tableId,
            position: index,
            removed: false,
            color: '#FF6B6B'
          }))
        }
        
        const sharedTab = sharedTabsService.createSharedTabFromBuffer(modifiedBuffer, [])
        
        sharedTab.name = formData.name.trim()
        sharedTab.description = formData.description.trim()
        
        if (sharedTab.type === 'metrics') {
          (sharedTab as SharedMetricsTabWithContent).metrics = (sharedTab as SharedMetricsTabWithContent).metrics.map(metric => ({
            ...metric,
            tabId: sharedTab.id,
            version: 1
          }))
        }
        
        const result = await sharedTabsService.saveSharedTab(sharedTab)
        
        if (result.success) {
          setBuilderOpen(false)
          setSelectedBuffer(null)
          toast.success("Shared widget tab created successfully")
          if (sharedTabsPopperActive) {
            loadSharedTabs()
          }
        } else {
          toast.error(formatErrorMessage(result, "Failed to create shared tab"))
        }
      } else {
        const processedQueries = formData.queries.map(q => {
          let query = q.query.trim()
          if (query && !query.endsWith(';')) {
            query += ';'
          }
          return { ...q, query }
        }).filter(q => q.query.length > 0)
        
        const sharedTab = sharedTabsService.createSharedTabFromBuffer(selectedBuffer, processedQueries)
        
        sharedTab.name = formData.name.trim()
        sharedTab.description = formData.description.trim()
        
        if (sharedTab.type === 'query') {
          (sharedTab as SharedQueryTabWithContent).queries = processedQueries.map((q) => ({
            tabId: sharedTab.id,
            version: 1,
            name: q.name.trim() || '',
            query: q.query
          }))
        }
        
        const result = await sharedTabsService.saveSharedTab(sharedTab)
        
        if (result.success) {
          setBuilderOpen(false)
          setSelectedBuffer(null)
          toast.success("Shared query tab created successfully")
          if (sharedTabsPopperActive) {
            loadSharedTabs()
          }
        } else {
          toast.error(formatErrorMessage(result, "Failed to create shared tab"))
        }
      }
    } catch (error) {
      console.error('Error creating shared tab:', error)
      toast.error(formatErrorMessage(error, "Failed to create shared tab"))
    }
  }

  const handleUpdateSharedTab = async (formData: typeof builderData) => {
    if (!sharedTabsService || !editingTabId) return
    
    const existingTab = sharedTabs.find(tab => tab.id === editingTabId)
    if (!existingTab) return
    let result: SaveSharedTabResult
    
    if (formData.type === 'metrics') {
      const metricsTab = {
        ...existingTab,
        name: formData.name.trim(),
        description: formData.description.trim(),
        version: (existingTab.version || 1) + 1
      } as SharedMetricsTabWithContent
      metricsTab.refreshRate = formData.refreshRate
      metricsTab.dateFrom = formData.dateFrom
      metricsTab.dateTo = formData.dateTo
      metricsTab.viewMode = formData.viewMode
      
      const updatedMetrics = formData.metrics.map((metric, index) => ({
        tabId: editingTabId,
        version: metricsTab.version,
        metricType: metric.metricType,
        tableId: metric.tableId ?? undefined,
        position: index,
        removed: false
      }))
      
      metricsTab.metrics = updatedMetrics
      result = await sharedTabsService.updateSharedTab(metricsTab)
    } else {
      const queryTab = {
        ...existingTab,
        name: formData.name.trim(),
        description: formData.description.trim(),
        version: (existingTab.version || 1) + 1
      } as SharedQueryTabWithContent
      const processedQueries = formData.queries.map((q, index) => {
        let query = q.query.trim()
        if (query && !query.endsWith(';')) {
          query += ';'
        }
        return {
          tabId: editingTabId,
          version: queryTab.version,
          name: q.name.trim() || '',
          query: query,
          position: index
        }
      }).filter(q => q.query.length > 0)
      
      queryTab.queries = processedQueries
      result = await sharedTabsService.updateSharedTab(queryTab)
    }
    
    if (result.success) {
      setBuilderOpen(false)
      setEditMode(false)
      setEditingTabId(null)
      setSelectedBuffer(null)
      toast.success(`Shared ${formData.type === 'metrics' ? 'widget' : 'query'} tab updated successfully`)
      if (sharedTabsPopperActive) {
        loadSharedTabs()
      }
    } else {
      toast.error(formatErrorMessage(result, "Failed to update shared tab"))
    }
  }

  const availableBuffers = buffers.filter(buffer => !buffer.archived)

  return (
    <>
      <PopperToggle
        active={sharedTabsPopperActive}
        onToggle={handleSharedTabsToggle}
        trigger={
          <SharedTabsButton
            skin="secondary"
            data-hook="editor-tabs-shared-button"
          >
            <FolderOpen size="18px" />
            <span>Shared</span>
          </SharedTabsButton>
        }
      >
        <SharedTabPicker
          hidePicker={handleHidePicker}
          sharedTabs={sharedTabs}
          openCategorySelection={openCategorySelection}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
        />
      </PopperToggle>

      <Dialog.Root open={tabSelectionOpen} onOpenChange={setTabSelectionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <DialogContent>
            <DialogTitle>Select Tab to Share</DialogTitle>
            
            <div style={{ padding: '2rem 0', overflow: 'auto' }}>
              <BlockTextWithMargin color="foreground">
                Choose which tab you want to create a shared version of:
              </BlockTextWithMargin>
              
              {availableBuffers.map((buffer) => (
                <TabSelectionItem
                  key={buffer.id}
                  onClick={() => selectBufferForBuilder(buffer)}
                >
                  <Box gap="1rem">
                    {buffer.metricsViewState ? (
                      <StyledInsertChart size="18px" />
                    ) : (
                      <StyledFile size="18px" />
                    )}
                    <Text color="foreground" ellipsis>
                      {buffer.label}
                    </Text>
                  </Box>
                </TabSelectionItem>
              ))}
            </div>
            
            <Box align="center" justifyContent="flex-end" style={{ marginTop: '2rem', flexShrink: '0' }}>
              <Button type="button" skin="secondary" onClick={() => setTabSelectionOpen(false)}>
                Cancel
              </Button>
            </Box>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={builderOpen} onOpenChange={(open) => {
        setBuilderOpen(open)
        if (!open) {
          setEditMode(false)
          setEditingTabId(null)
          setSelectedBuffer(null)
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <DialogContent>
            <Form
              name="shared-tab-form"
              className="shared-tab-form"
              onSubmit={handleBuilderSave}
              validationSchema={sharedTabSchema}
              defaultValues={builderData}
            >
              <DialogTitle>
                {editMode ? 'Edit' : 'Create'} Shared {builderData.type === 'metrics' ? 'Widget' : 'Query'} Tab
              </DialogTitle>
              
              <div style={{ padding: '2rem 0', maxHeight: '100%', flex: '1 1 auto', overflow: 'hidden' }}>
                <VirtualizedFormContent builderData={builderData} />
              </div>
              
              <Box align="center" justifyContent="flex-end" gap="1rem" width="100%" style={{ paddingTop: '2rem', flex: '1' }}>
                <div style={{ flex: 1 }} />
                <Form.Cancel onClick={() => {
                  setBuilderOpen(false)
                  setEditMode(false)
                  setEditingTabId(null)
                  setSelectedBuffer(null)
                }}>
                  Cancel
                </Form.Cancel>
                <FormSubmitButton editMode={editMode} />
              </Box>
            </Form>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={categorySelectionOpen} onOpenChange={setCategorySelectionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <DialogContent>
            <DialogTitle>Create Shared Tab</DialogTitle>
            
            <div style={{ padding: '2rem 0', overflow: 'auto' }}>
              <div style={{ marginBottom: '2rem' }}>
                <CategoryTitle>
                  Create from existing tab
                </CategoryTitle>
                <TabSelectionItem
                  onClick={() => {
                    setCategorySelectionOpen(false)
                    openTabSelection()
                  }}
                >
                  <Box gap="1rem">
                    <FolderOpen size="18px" />
                    <Text color="foreground">Select an existing tab</Text>
                  </Box>
                </TabSelectionItem>
              </div>

              <div>
                <CategoryTitle>
                  Create from scratch
                </CategoryTitle>
                <TabSelectionItem
                  onClick={() => {
                    setCategorySelectionOpen(false)
                    createNewQueryTab()
                  }}
                  style={{ marginBottom: '1rem' }}
                >
                  <Box gap="1rem">
                    <StyledFile size="18px" />
                    <Text color="foreground">Create a new shared query tab</Text>
                  </Box>
                </TabSelectionItem>
                
                <TabSelectionItem
                  onClick={() => {
                    setCategorySelectionOpen(false)
                    createNewWidgetTab()
                  }}
                >
                  <Box gap="1rem">
                    <StyledInsertChart size="18px" />
                    <Text color="foreground">Create a new shared widget tab</Text>
                  </Box>
                </TabSelectionItem>
              </div>
            </div>
            
            <Box align="center" justifyContent="flex-end" style={{ marginTop: '2rem', flexShrink: '0' }}>
              <Button type="button" skin="secondary" onClick={() => setCategorySelectionOpen(false)}>
                Cancel
              </Button>
            </Box>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <DialogContent style={{ maxWidth: '500px', zIndex: 1001 }}>
            <DialogTitle>Delete Shared Tab</DialogTitle>
            
            <div style={{ padding: '2rem 0' }}>
              <Text color="foreground">
                Are you sure you want to delete this shared tab for all users?
              </Text>
            </div>
            
            <Box align="center" justifyContent="flex-end" gap="1rem" style={{ marginTop: '2rem', flexShrink: '0' }}>
              <Button type="button" skin="secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button type="button" skin="error" onClick={confirmDeleteTab}>
                Delete
              </Button>
            </Box>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
} 