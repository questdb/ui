import type { languages } from "monaco-editor"
import {
  constants,
  dataTypes,
  functions,
  keywords,
  operators,
} from "@questdb/sql-parser"
import { escapeRegExpCharacters } from "../../../../utils/textSearch"

const functionPattern = new RegExp(
  `(${functions.map(escapeRegExpCharacters).join("|")})(\\s*)(?=\\s*\\()`,
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
      [/;/, { token: "delimiter", next: "@popall" }],
      [/\[/, { token: "@brackets", next: "@arrayOperand" }],
      [/\(/, { token: "@brackets", next: "@parenthesizedExpression" }],
      { include: "@bindVariables" },
      { include: "@expression" },
    ],
    arrayOperand: [
      { include: "@comments" },
      { include: "@whitespace" },
      [
        /:[a-z0-9_\u0080-\uFFFF][\w$\u0080-\uFFFF]*/,
        { token: "variable", switchTo: "@squareBrackets" },
      ],
      [/./, { token: "@rematch", switchTo: "@squareBrackets" }],
    ],
    // A colon after an operand is a slice; after an opening bracket or
    // operator it can begin a bind. Parentheses and CASE have their own scope.
    squareBrackets: [
      [/;/, { token: "delimiter", next: "@popall" }],
      { include: "@comments" },
      { include: "@whitespace" },
      [/\[/, { token: "@brackets", next: "@arrayOperand" }],
      [/\]/, { token: "@brackets", next: "@pop" }],
      [/\(/, { token: "@brackets", next: "@parenthesizedExpression" }],
      [
        /CASE(?![\w$\u0080-\uFFFF])/,
        { token: "keyword.block", next: "@arrayCase" },
      ],
      [/::/, "operator"],
      [/,/, { token: "delimiter", switchTo: "@arrayOperand" }],
      [/[<>=!%&+\-*/|~^]/, { token: "operator", switchTo: "@arrayOperand" }],
      [/[a-z_\u0080-\uFFFF][\w$\u0080-\uFFFF]*(?=\s*:)/, "identifier"],
      { include: "@expression" },
    ],
    parenthesizedExpression: [
      [/\)/, { token: "@brackets", next: "@pop" }],
      { include: "@root" },
    ],
    arrayCase: [
      [/CASE(?![\w$\u0080-\uFFFF])/, { token: "keyword.block", next: "@push" }],
      [/END(?![\w$\u0080-\uFFFF])/, { token: "keyword.block", next: "@pop" }],
      { include: "@root" },
    ],
    expression: [
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
      [/--.*$/, "comment"],
      [/'(?:[^']|'')*'/, "comment"],
      [/"(?:[^"]|"")*"/, "comment"],
      [/`[^`]*`/, "comment"],
      [/[^*/\-'"`]+/, "comment"],
      [/\/\*/, { token: "comment.quote", next: "@push" }],
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
    // Same literal forms as the @questdb/sql-parser lexer, so that each is
    // colored as one number: 0x1F, 1.5f, 1e36d, 10L, 10.5m, 1.5e3m, 100ns,
    // 1.5d, 1_000, .5, 1e-3. The sign is a separate operator, as in the parser.
    numbers: [
      [/0[xX][0-9a-fA-F]+\b/, "number"], // hex / long256
      [
        /(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(([eE][+-]?\d[\d_]*)?f|[eE][+-]?\d[\d_]*d)\b/,
        "number",
      ], // float / double suffix
      [/\d[\d_]*l\b/, "number"], // long suffix
      [/\d[\d_]*(\.\d[\d_]*m|(\.[\d_]*)?e[+-]?\d[\d_]*m)\b/, "number"], // decimal
      [/\d[\d_]*(\.\d[\d_]*)?(ms|us|ns|[smhdwyntu])\b/, "number"], // durations
      [/(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(e[+-]?\d[\d_]*)?/, "number"],
    ],
    strings: [
      [/N'/, { token: "string", next: "@string" }],
      [/E'/, { token: "string", next: "@string" }], // escape string E'...'
      [/'/, { token: "string", next: "@string" }],
    ],
    string: [
      [/[^']+/, "string"],
      [/''/, "string"],
      [/'/, { token: "string", next: "@pop" }],
    ],
    variable: [
      [/\$\d+/, "variable"], // positional bind variable
      [/@[\w.$]+/, "variable"],
      [/@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/, "variable"],
    ],
    // `::` is a cast; a bind name can also start with a digit or Unicode.
    bindVariables: [
      [/::/, "operator"],
      [/:[a-z0-9_\u0080-\uFFFF][\w$\u0080-\uFFFF]*/, "variable"],
    ],
    complexIdentifiers: [
      [/"/, { token: "identifier.quote", next: "@quotedIdentifier" }],
      [/`/, { token: "identifier.quote", next: "@backtickIdentifier" }],
    ],
    // `name` has no escapes: it ends at the next backtick
    backtickIdentifier: [
      [/[^`]+/, "identifier"],
      [/`/, { token: "identifier.quote", next: "@pop" }],
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
    array: [[/ARRAY\s*\[/, { token: "keyword", next: "@arrayOperand" }]],
  },
}
