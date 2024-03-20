import * as monaco from "monaco-editor"
import { functions } from "./functions";
import { FunctionWithDoc } from "./types";

const parametersToMarkdown = (parameters: FunctionWithDoc["parameters"]) => {
  return parameters.map((p) => `\`${p.label}\` - ${p.documentation}`).join("\n\n")
}

const functionDocsToMarkdown = (f: FunctionWithDoc) => `
__${f.label}__

---

&nbsp;

${f.documentation}

&nbsp;

${parametersToMarkdown(f.parameters)}

${f.parameters.length > 0 ? "&nbsp;" : ""}

${f.docsLink}
`

export const hoverProvider: monaco.languages.HoverProvider = {
  provideHover: (model, position) => {
    const word = model.getWordAtPosition(position)

    if (word?.word && word.word.indexOf("(") !== -1) {
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        contents: (functions as FunctionWithDoc[])
          .filter((f) => f.name.toLowerCase() === word.word.split("(")[0].toLowerCase())
          .map(f => {
            return {
              value: functionDocsToMarkdown(f),
              supportHtml: true,
              range,
            }
          })
      }
    }

    return {
      contents: []
    }
  }
}
