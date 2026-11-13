import type { CellLayoutItem, NotebookCell } from "../../../../store/notebook"

const SIZE_FIELDS = [
  "topHeight",
  "bottomHeight",
  "topResized",
  "bottomResized",
  "spotlightEditorRatio",
] as const

export type CellSizes = Pick<NotebookCell, (typeof SIZE_FIELDS)[number]>

// Where the cells are and how big they are: the cell order, the saved grid
// layout, and the pane sizes of some cells. A recorded change keeps only the
// parts, and only the size fields, that the gesture changed: an editor that
// grew with its text since keeps its height when a result resize is undone.
export type Arrangement = {
  order?: string[]
  layout?: CellLayoutItem[]
  sizes?: Record<string, Partial<CellSizes>>
}

export type ArrangementChange = { before: Arrangement; after: Arrangement }

export const sizesOf = (cell: NotebookCell): CellSizes =>
  Object.fromEntries(
    SIZE_FIELDS.map((field) => [field, cell[field]]),
  ) as CellSizes

// A gesture can write the store before it ends, e.g. a split drag that adds
// grid rows, so the caller can give the cells as they were at its start.
type FullArrangement = Required<Omit<Arrangement, "sizes">> & {
  sizes: Record<string, CellSizes>
}

export const arrangementOf = (
  cells: NotebookCell[],
  layout: CellLayoutItem[] | undefined,
  cellIds: string[],
  startCells: NotebookCell[] = [],
): FullArrangement => ({
  order: cells.map((cell) => cell.id),
  layout: layout ?? [],
  sizes: Object.fromEntries(
    cellIds.flatMap((cellId) => {
      const cell =
        startCells.find((c) => c.id === cellId) ??
        cells.find((c) => c.id === cellId)
      return cell ? [[cellId, sizesOf(cell)]] : []
    }),
  ),
})

const sameOrder = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((cellId, index) => cellId === b[index])

const sameLayout = (a: CellLayoutItem[], b: CellLayoutItem[]): boolean =>
  a.length === b.length &&
  a.every((item) => {
    const other = b.find(({ i }) => i === item.i)
    return (
      other !== undefined &&
      other.x === item.x &&
      other.y === item.y &&
      other.w === item.w &&
      other.h === item.h
    )
  })

const changedSizeFields = (a: CellSizes, b: CellSizes) =>
  SIZE_FIELDS.filter((field) => a[field] !== b[field])

const pickFields = (
  sizes: Partial<CellSizes>,
  fields: (typeof SIZE_FIELDS)[number][],
): Partial<CellSizes> =>
  Object.fromEntries(fields.map((field) => [field, sizes[field]]))

export const arrangementChange = (
  before: FullArrangement,
  after: FullArrangement,
): ArrangementChange | null => {
  const changed: ArrangementChange = { before: {}, after: {} }
  if (!sameOrder(before.order, after.order)) {
    changed.before.order = before.order
    changed.after.order = after.order
  }
  if (!sameLayout(before.layout, after.layout)) {
    changed.before.layout = before.layout
    changed.after.layout = after.layout
  }
  const resized = Object.keys(after.sizes).flatMap((cellId) => {
    const start = before.sizes[cellId]
    if (start === undefined) return []
    const fields = changedSizeFields(start, after.sizes[cellId])
    return fields.length > 0 ? [{ cellId, fields }] : []
  })
  if (resized.length > 0) {
    changed.before.sizes = Object.fromEntries(
      resized.map(({ cellId, fields }) => [
        cellId,
        pickFields(before.sizes[cellId], fields),
      ]),
    )
    changed.after.sizes = Object.fromEntries(
      resized.map(({ cellId, fields }) => [
        cellId,
        pickFields(after.sizes[cellId], fields),
      ]),
    )
  }
  return Object.keys(changed.after).length > 0 ? changed : null
}

// Size fields of the same cell from the second set win.
const sizesPart = (
  first: Arrangement["sizes"],
  second: Arrangement["sizes"],
): Pick<Arrangement, "sizes"> => {
  if (!first && !second) return {}
  const cellIds = new Set([
    ...Object.keys(first ?? {}),
    ...Object.keys(second ?? {}),
  ])
  return {
    sizes: Object.fromEntries(
      [...cellIds].map((cellId) => [
        cellId,
        { ...first?.[cellId], ...second?.[cellId] },
      ]),
    ),
  }
}

// Two changes in a row become one: the older one keeps the start of each
// part, the newer one gives its end.
export const mergeArrangementChanges = (
  older: ArrangementChange,
  newer: ArrangementChange,
): ArrangementChange => ({
  before: {
    ...newer.before,
    ...older.before,
    ...sizesPart(newer.before.sizes, older.before.sizes),
  },
  after: {
    ...older.after,
    ...newer.after,
    ...sizesPart(older.after.sizes, newer.after.sizes),
  },
})

// What is left of a change once the parts that end where they started are
// dropped, e.g. a cell moved down and back up again. Null when nothing is.
export const effectiveChange = ({
  before,
  after,
}: ArrangementChange): ArrangementChange | null => {
  const effective: ArrangementChange = { before: {}, after: {} }
  if (before.order && after.order && !sameOrder(before.order, after.order)) {
    effective.before.order = before.order
    effective.after.order = after.order
  }
  if (
    before.layout &&
    after.layout &&
    !sameLayout(before.layout, after.layout)
  ) {
    effective.before.layout = before.layout
    effective.after.layout = after.layout
  }
  const resized = Object.entries(after.sizes ?? {}).flatMap(([cellId, end]) => {
    const start = before.sizes?.[cellId] ?? {}
    const fields = SIZE_FIELDS.filter(
      (field) => field in end && start[field] !== end[field],
    )
    return fields.length > 0 ? [{ cellId, start, end, fields }] : []
  })
  if (resized.length > 0) {
    effective.before.sizes = Object.fromEntries(
      resized.map(({ cellId, start, fields }) => [
        cellId,
        pickFields(start, fields),
      ]),
    )
    effective.after.sizes = Object.fromEntries(
      resized.map(({ cellId, end, fields }) => [
        cellId,
        pickFields(end, fields),
      ]),
    )
  }
  return Object.keys(effective.after).length > 0 ? effective : null
}
