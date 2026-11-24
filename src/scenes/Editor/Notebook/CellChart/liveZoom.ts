import type { EChartsType } from "echarts"

// ECharts' live component lookup gives us the resolved axes and generated IDs
// without cloning the series and datasets in getOption().
export type ZoomControl = {
  id: string
  componentIndex: number
  getAxisModel(dim: string, index: number): unknown
  /** Each axis the control moves, first the one it is known by. */
  eachTargetAxis(callback: (dim: string, index: number) => void): void
  getPercentRange(): [number, number] | undefined
  getValueRange(dim?: string, index?: number): [number, number] | undefined
}

type LiveModel = {
  getComponent(
    type: "xAxis",
    index: number,
  ): { get(key: "type"): unknown } | undefined
  queryComponents(query: { mainType: "dataZoom" }): ZoomControl[]
}

const modelOf = (instance: EChartsType) =>
  (instance as unknown as { getModel(): LiveModel | undefined }).getModel()

export const isTimeChart = (instance: EChartsType): boolean =>
  modelOf(instance)?.getComponent("xAxis", 0)?.get("type") === "time"

export const zoomControls = (instance: EChartsType): ZoomControl[] =>
  modelOf(instance)?.queryComponents({ mainType: "dataZoom" }) ?? []

export const primaryXControls = (instance: EChartsType): ZoomControl[] =>
  zoomControls(instance).filter((zoom) => zoom.getAxisModel("x", 0))

export type ZoomTarget = {
  dataZoomId?: string
  dataZoomIndex?: number | number[]
}

export const zoomForTarget = (
  controls: ZoomControl[],
  event: ZoomTarget | undefined,
) => {
  const { dataZoomId, dataZoomIndex } = event ?? {}
  if (dataZoomId !== undefined)
    return controls.find(({ id }) => id === dataZoomId)
  if (Array.isArray(dataZoomIndex))
    return controls.find(({ componentIndex }) =>
      dataZoomIndex.includes(componentIndex),
    )
  if (dataZoomIndex !== undefined)
    return controls.find(
      ({ componentIndex }) => componentIndex === dataZoomIndex,
    )
  return controls[0]
}
