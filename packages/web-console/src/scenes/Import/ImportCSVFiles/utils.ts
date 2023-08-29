import { SchemaColumn } from "components/TableSchemaDialog/types"

export const isGeoHash = (type: string) => type.startsWith("GEOHASH")

export const extractPrecionFromGeohash = (geohash: string) => {
  const regex = /\(([^)]+)\)/g
  const matches = regex.exec(geohash)
  if (matches && matches.length > 1) {
    return matches[1]
  }
  return ""
}

export const mapColumnTypeToUI = (type: string) => {
  if (isGeoHash(type)) {
    return "GEOHASH"
  } else return type.toUpperCase()
}

export const mapColumnTypeToQuestDB = (column: SchemaColumn) => {
  if (column.type === "GEOHASH") {
    return {
      ...column,
      type: `GEOHASH(${column.precision})`,
    }
  }
  return column
}

const str = () =>
  (
    "00000000000000000" + (Math.random() * 0xffffffffffffffff).toString(16)
  ).slice(-16)

export const uuid = () => {
  const a = str()
  const b = str()
  return (
    a.slice(0, 8) +
    "-" +
    a.slice(8, 12) +
    "-4" +
    a.slice(13) +
    "-a" +
    b.slice(1, 4) +
    "-" +
    b.slice(4)
  )
}
