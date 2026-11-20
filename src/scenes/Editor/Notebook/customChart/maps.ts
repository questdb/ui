import { echarts } from "../CellChart/echartsSetup"

// Base maps a chart can draw on. They load on first use, so the GeoJSON is
// not part of the main bundle.

export { MAP_NAMES, type MapName } from "./mapNames"

let worldLoad: Promise<void> | null = null

const loadWorld = async () => {
  const [{ feature }, topology] = await Promise.all([
    import("topojson-client"),
    import("world-atlas/countries-110m.json"),
  ])
  const topo = (topology as { default?: unknown }).default ?? topology
  const geo = feature(
    topo as Parameters<typeof feature>[0],
    (topo as { objects: { countries: Parameters<typeof feature>[1] } }).objects
      .countries,
  )
  echarts.registerMap(
    "world",
    geo as unknown as Parameters<typeof echarts.registerMap>[1],
  )
}

/** Resolves once the named maps are registered with ECharts. */
export const ensureMaps = (names: string[]): Promise<void> => {
  if (!names.includes("world")) return Promise.resolve()
  worldLoad ??= loadWorld().catch((e: unknown) => {
    worldLoad = null
    throw e
  })
  return worldLoad
}

export const isMapLoaded = (name: string): boolean =>
  echarts.getMap(name) !== undefined

/** Map names an option uses (geo.map and map series). */
export const mapsUsedBy = (option: Record<string, unknown>): string[] => {
  const names = new Set<string>()
  const collect = (node: unknown) => {
    for (const item of Array.isArray(node) ? node : [node]) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as { map?: unknown }).map === "string"
      )
        names.add((item as { map: string }).map)
    }
  }
  collect(option.geo)
  collect(option.series)
  return [...names]
}
