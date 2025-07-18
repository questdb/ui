import { getSectionExpanded } from "../localStorageUtils"
import { TreeNode, SchemaTree, FlattenedTreeItem } from "../VirtualTables"
import * as QuestDB from "../../../utils/questdb"

export const createColumnNodes = (table: QuestDB.Table, parentId: string, columns: QuestDB.Column[]): TreeNode[] => {
  return columns.map(column => {
    const columnId = `${parentId}:${column.column}`;
    
    const columnNode: TreeNode = {
      id: columnId,
      kind: 'column',
      name: column.column,
      column,
      parent: parentId,
      isExpanded: getSectionExpanded(columnId),
      designatedTimestamp: table.designatedTimestamp,
      type: column.type,
      children: []
    };

    if (column.type === 'SYMBOL') {
      columnNode.children = [
        {
          id: `${columnId}:indexed`,
          kind: 'detail',
          name: 'Indexed',
          parent: columnId,
          value: column.indexed ? 'Yes' : 'No',
          children: []
        },
        {
          id: `${columnId}:symbolCapacity`,
          kind: 'detail',
          name: 'Symbol capacity',
          parent: columnId,
          value: column.symbolCapacity.toString(),
          children: []
        },
        {
          id: `${columnId}:symbolCached`,
          kind: 'detail',
          name: 'Cached',
          parent: columnId,
          value: column.symbolCached ? 'Yes' : 'No',
          children: []
        }
      ];
    }

    return columnNode;
  });
  };

const createStorageDetailsNodes = (
  table: QuestDB.Table,
  parentId: string,
): TreeNode[] => {
  return [
    {
      id: `${parentId}:partitionBy`,
      kind: 'detail',
      name: 'Partitioning',
      parent: parentId,
      value: table.partitionBy && table.partitionBy !== 'NONE' ? `By ${table.partitionBy.toLowerCase()}` : 'None',
      children: []
    },
    {
      id: `${parentId}:walEnabled`,
      kind: 'detail',
      name: 'WAL',
      parent: parentId,
      value: table.walEnabled ? 'Enabled' : 'Disabled',
      children: []
    }
  ];
};

export const createTableNode = (
  table: QuestDB.Table,
  parentId: string,
  isMatView: boolean = false,
  materializedViews: QuestDB.MaterializedView[] | undefined,
  walTables: QuestDB.WalTable[] | undefined
): TreeNode => {
  const tableId = `${parentId}:${table.table_name}`
  const matViewData = isMatView ? materializedViews?.find(mv => mv.view_name === table.table_name) : undefined
  const walTableData = walTables?.find(wt => wt.name === table.table_name)

  const columnsId = `${tableId}:columns`;
  const baseTablesId = `${tableId}:baseTables`;
  const storageDetailsId = `${tableId}:storageDetails`;

  const tableNode: TreeNode = {
    id: tableId,
    kind: isMatView ? 'matview' : 'table',
    name: table.table_name,
    table,
    matViewData,
    parent: parentId,
    isExpanded: getSectionExpanded(tableId),
    partitionBy: table.partitionBy,
    walEnabled: table.walEnabled,
    designatedTimestamp: table.designatedTimestamp,
    walTableData,
    children: [
      {
        id: columnsId,
        kind: 'folder',
        name: 'Columns',
        table: table,
        parent: tableId,
        isExpanded: getSectionExpanded(columnsId),
        children: []
      },
      {
        id: storageDetailsId,
        kind: 'folder',
        name: 'Storage details',
        parent: tableId,
        isExpanded: getSectionExpanded(storageDetailsId),
        children: createStorageDetailsNodes(table, storageDetailsId)
      }
    ]
  };

  if (isMatView && matViewData) {
    tableNode.children.push({
      id: baseTablesId,
      kind: 'folder',
      name: 'Base tables',
      parent: tableId,
      isExpanded: getSectionExpanded(baseTablesId),
      children: [{
        id: `${baseTablesId}:${matViewData.base_table_name}`,
        kind: 'detail',
        name: matViewData.base_table_name,
        parent: baseTablesId,
        children: []
      }]
    })
  }

  return tableNode;
};

export const getNodeFromSchemaTree = (schemaTree: SchemaTree, id: string): { node: TreeNode, parent: SchemaTree | TreeNode } | undefined => {
  const [sectionPart1, sectionPart2, sectionPart3, ...segments] = id.split(':')
  const section = `${sectionPart1}:${sectionPart2}:${sectionPart3}`
  let currentNode = schemaTree[section]
  
  if (!currentNode) {
    return undefined
  }

  let currentId = section
  let parent: SchemaTree | TreeNode = schemaTree

  for (const segment of segments) {
    currentId = `${currentId}:${segment}`
    const child = currentNode?.children?.find(child => child.id === currentId)
    if (!child) {
      return undefined
    }
    parent = currentNode
    currentNode = child
  }
  return { node: currentNode, parent: parent }
}

export const updateAndGetSchemaTree = (schemaTree: SchemaTree, id: string, update: (node: TreeNode) => TreeNode): SchemaTree => {
  const result = getNodeFromSchemaTree(schemaTree, id)
  if (!result) {
    return schemaTree
  }

  const { node, parent } = result
  const newTree = { ...schemaTree }
  if (node) {
    const updatedNode = update(node)
    if (parent.id) {
      parent.children = (parent.children as TreeNode[]).map((child: TreeNode) => child.id === id ? updatedNode : child)
    } else {
      newTree[id] = updatedNode
    }
  }

  return newTree
}

export const findRowIndexById = (flattenedItems: FlattenedTreeItem[], id: string) => {
  return flattenedItems.findIndex(item => item.id === id)
}

export const flattenTree = (node: TreeNode): FlattenedTreeItem[] => {
  const result: FlattenedTreeItem[] = [node];
  
  if (node.isExpanded) {
    node.children.forEach(child => {
      result.push(...flattenTree(child));
    });
  }
  
  return result;
}
