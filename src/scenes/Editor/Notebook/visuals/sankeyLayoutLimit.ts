// ECharts' main-thread Sankey layout searches all links for each edge.
export const MAX_SANKEY_LINKS = 2_000

export const SANKEY_LINK_LIMIT_MESSAGE = `Sankey is limited to ${MAX_SANKEY_LINKS.toLocaleString("en-US")} links to keep layout responsive. Aggregate flows in SQL or choose a graph visual.`
