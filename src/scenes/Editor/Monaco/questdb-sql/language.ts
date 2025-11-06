import { operators } from "./operators"
import type { languages } from "monaco-editor"
import { constants, dataTypes, functions, keywords } from "@questdb/sql-grammar"
import { escapeRegExpCharacters } from "../../../../utils/textSearch"

const functionPattern = new RegExp(
  `(${functions
    .filter((fn) => !keywords.includes(fn))
    .map(escapeRegExpCharacters)
    .join("|")})(\\s*)(?=\\s*\\()`,
  "i",
)

export const language: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".sql",
  ignoreCase: true,

  brackets: [
    { open: "[", close: "]", token: "delimiter.square" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
  ],
  constants,
  dataTypes,
  keywords,
  operators,
  builtinVariables: [
    // Configuration
    "@@DATEFIRST",
    "@@DBTS",
    "@@LANGID",
    "@@LANGUAGE",
    "@@LOCK_TIMEOUT",
    "@@MAX_CONNECTIONS",
    "@@MAX_PRECISION",
    "@@NESTLEVEL",
    "@@OPTIONS",
    "@@REMSERVER",
    "@@SERVERNAME",
    "@@SERVICENAME",
    "@@SPID",
    "@@TEXTSIZE",
    "@@VERSION",
    // Cursor
    "@@CURSOR_ROWS",
    "@@FETCH_STATUS",
    // Datetime
    "@@DATEFIRST",
    // Metadata
    "@@PROCID",
    // System
    "@@ERROR",
    "@@IDENTITY",
    "@@ROWCOUNT",
    "@@TRANCOUNT",
    // Stats
    "@@CONNECTIONS",
    "@@CPU_BUSY",
    "@@IDLE",
    "@@IO_BUSY",
    "@@PACKET_ERRORS",
    "@@PACK_RECEIVED",
    "@@PACK_SENT",
    "@@TIMETICKS",
    "@@TOTAL_ERRORS",
    "@@TOTAL_READ",
    "@@TOTAL_WRITE",
  ],
  pseudoColumns: ["$ACTION", "$IDENTITY", "$ROWGUID", "$PARTITION"],
  tokenizer: {
    root: [
      { include: "@comments" },
      { include: "@whitespace" },
      { include: "@pseudoColumns" },
      { include: "@numbers" },
      { include: "@strings" },
      [functionPattern, "predefined"],
      { include: "@complexIdentifiers" },
      { include: "@variable" },
      { include: "@scopes" },
      { include: "@array" },
      [/[;,.]/, "delimiter"],
      [/[()[\]]/, "@brackets"],
      [
        /[\w@#$]+/,
        {
          cases: {
            "@constants": "constant.language",
            "@operators": "operator",
            "@builtinVariables": "predefined",
            "@keywords": "keyword",
            "@dataTypes": "dataType",
            "@default": "identifier",
          },
        },
      ],
      [/[<>=!%&+\-*/|~^:]/, "operator"],
    ],
    whitespace: [[/\s+/, "white"]],
    comments: [
      [/--+.*/, "comment"],
      [/\/\*/, { token: "comment.quote", next: "@comment" }],
    ],
    comment: [
      [/[^*/]+/, "comment"],
      // Not supporting nested comments, as nested comments seem to not be standard?
      // i.e. http://stackoverflow.com/questions/728172/are-there-multiline-comment-delimiters-in-sql-that-are-vendor-agnostic
      // [/\/\*/, { token: 'comment.quote', next: '@push' }],    // nested comment not allowed :-(
      [/\*\//, { token: "comment.quote", next: "@pop" }],
      [/./, "comment"],
    ],
    pseudoColumns: [
      [
        /[$][A-Za-z_][\w@#$]*/,
        {
          cases: {
            "@pseudoColumns": "predefined",
            "@default": "identifier",
          },
        },
      ],
    ],
    numbers: [
      [/\b(\d+)([utsmhdwmy])\b/i, "number"], // sampling rate
      [/([+-]?\d+\.\d+[eE]?[+-]?\d+)/, "number"], // floating point number
      [/0[xX][0-9a-fA-F]*/, "number"], // hex integers
      [/[+-]?\d+((_)?\d+)*[Ll]?/, "number"], // integers
    ],
    strings: [
      [/N'/, { token: "string", next: "@string" }],
      [/'/, { token: "string", next: "@string" }],
    ],
    string: [
      [/[^']+/, "string"],
      [/''/, "string"],
      [/'/, { token: "string", next: "@pop" }],
    ],
    variable: [
      [/@[\w.$]+/, "variable"],
      [/@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/, "variable"],
    ],
    complexIdentifiers: [
      [/"/, { token: "identifier.quote", next: "@quotedIdentifier" }],
    ],
    quotedIdentifier: [
      [/[^"]+/, "identifier"],
      [/""/, "identifier"],
      [/"/, { token: "identifier.quote", next: "@pop" }],
    ],
    scopes: [
      [/BEGIN\s+(DISTRIBUTED\s+)?TRAN(SACTION)?\b/i, "keyword"],
      [/BEGIN\s+TRY\b/i, { token: "keyword.try" }],
      [/END\s+TRY\b/i, { token: "keyword.try" }],
      [/BEGIN\s+CATCH\b/i, { token: "keyword.catch" }],
      [/END\s+CATCH\b/i, { token: "keyword.catch" }],
      [/(BEGIN|CASE)\b/i, { token: "keyword.block" }],
      [/END\b/i, { token: "keyword.block" }],
      [/WHEN\b/i, { token: "keyword.choice" }],
      [/THEN\b/i, { token: "keyword.choice" }],
    ],
    array: [[/ARRAY\s*\[/, { token: "keyword", next: "@arrayArguments" }]],
    arrayArguments: [
      { include: "@comments" },
      { include: "@whitespace" },
      { include: "@numbers" },
      { include: "@strings" },
      [/\[/, { token: "delimiter.square", next: "@arrayArguments" }],
      [/\]/, { token: "delimiter.square", next: "@pop" }],
      [/,/, "delimiter"],
    ],
  },
}
