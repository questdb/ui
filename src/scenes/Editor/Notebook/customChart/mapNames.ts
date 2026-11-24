// The base maps a chart can draw on, by name; maps.ts loads them.

export const MAP_NAMES = ["world"] as const

export type MapName = (typeof MAP_NAMES)[number]
