import type { IRange, editor, languages } from "monaco-editor"
import { formatSql } from "../../../../utils"

export const documentFormattingEditProvider = {
  provideDocumentFormattingEdits(
    model: editor.IModel,
    options: languages.FormattingOptions,
  ) {
    const formatted = formatSql(model.getValue(), {
      indent: " ".repeat(options.tabSize),
    })
    return [
      {
        range: model.getFullModelRange(),
        text: formatted,
      },
    ]
  },
}

export const documentRangeFormattingEditProvider = {
  provideDocumentRangeFormattingEdits(
    model: editor.IModel,
    range: IRange,
    options: languages.FormattingOptions,
  ) {
    const formatted = formatSql(model.getValueInRange(range), {
      indent: " ".repeat(options.tabSize),
    })
    return [
      {
        range,
        text: formatted,
      },
    ]
  },
}
