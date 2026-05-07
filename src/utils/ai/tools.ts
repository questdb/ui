import type { ToolDefinition } from "./types"

export const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: "suggest_query",
    description:
      "Suggest a SQL query to the user. The query will be displayed as a suggestion that the user can accept or reject. Always validate the query using validate_query before suggesting it.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The SQL query to suggest to the user",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "validate_query",
    description:
      "Validate the syntax correctness of a SQL query using QuestDB's SQL syntax validator. All generated SQL queries should be validated using this tool before responding to the user.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The SQL query to validate",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_questdb_toc",
    description:
      "Get a table of contents listing all available QuestDB functions, operators, and SQL keywords. Use this first to see what documentation is available before requesting specific items.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_questdb_documentation",
    description:
      "Get documentation for specific QuestDB functions, operators, or SQL keywords. This is much more efficient than loading all documentation.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "functions",
            "operators",
            "sql",
            "concepts",
            "schema",
            "cookbook",
          ],
          description: "The category of documentation to retrieve",
        },
        items: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "List of specific docs items in the category. IMPORTANT: Category of these items must match the category parameter. Name of these items should exactly match the entry in the table of contents you get with get_questdb_toc.",
        },
      },
      required: ["category", "items"],
    },
  },
]

export const SCHEMA_TOOLS: ToolDefinition[] = [
  {
    name: "get_tables",
    description:
      "Get a list of all tables and materialized views in the QuestDB database",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_table_schema",
    description:
      "Get the full schema definition (DDL) for a specific table or materialized view",
    inputSchema: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description:
            "The name of the table or materialized view to get schema for",
        },
      },
      required: ["table_name"],
    },
  },
  {
    name: "get_table_details",
    description:
      "Get the runtime details/statistics of a specific table or materialized view",
    inputSchema: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description:
            "The name of the table or materialized view to get details for",
        },
      },
      required: ["table_name"],
    },
  },
]

export const ALL_TOOLS: ToolDefinition[] = [...DEFAULT_TOOLS, ...SCHEMA_TOOLS]
