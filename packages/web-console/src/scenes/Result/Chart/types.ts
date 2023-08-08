export type ChartType = "line" | "area" | "bar"

export type ChartConfig = {
  type: "line" | "area" | "bar"
  label: string
  series: string[]
}
