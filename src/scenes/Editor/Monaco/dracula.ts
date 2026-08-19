import type { editor } from "monaco-editor"
import type { ColorShape, ThemeMode } from "../../../types"
import { withAlpha } from "../../../theme"

const stripHash = (value: string) => value.replace(/^#/, "")

export const createDraculaTheme = (
  colors: ColorShape,
  mode: ThemeMode = "dark",
): editor.IStandaloneThemeData => {
  const mainBackground = colors.editorCanvas
  const listHoverBackground =
    mode === "light"
      ? colors.gridSelection
      : withAlpha(colors.editorSelectionAccent, 0.48)
  const Dracula: editor.IStandaloneThemeData = {
    base: mode === "light" ? "vs" : "vs-dark",
    inherit: true,
    rules: [
      {
        background: mainBackground,
        token: "",
      },
      {
        foreground: stripHash(colors.contentMuted),
        token: "comment",
      },
      {
        foreground: stripHash(colors.editorSyntaxString),
        token: "string",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token: "number",
      },
      {
        foreground: stripHash(colors.editorSyntaxString),
        token: "string.sql",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "operator.sql",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        fontStyle: "italic",
        token: "dataType",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        token: "predefined.sql",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        token: "function",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "constant.numeric",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "constant.language",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "constant.character",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "constant.other",
      },
      {
        foreground: stripHash(colors.editorSyntaxVariable),
        token: "variable.other.readwrite.instance",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "constant.character.escaped",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "constant.character.escape",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "string source",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "string source.ruby",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "keyword",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "storage",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        fontStyle: "italic",
        token: "storage.type",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        fontStyle: "underline",
        token: "entity.name.class",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        fontStyle: "italic underline",
        token: "entity.other.inherited-class",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token: "entity.name.function",
      },
      {
        foreground: stripHash(colors.editorSyntaxVariable),
        fontStyle: "italic",
        token: "variable.parameter",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "variable",
        fontStyle: "italic",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "entity.name.tag",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token: "entity.other.attribute-name",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        token: "support.function",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        token: "support.constant",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        fontStyle: " italic",
        token: "support.type",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        fontStyle: " italic",
        token: "support.class",
      },
      {
        foreground: stripHash(colors.contentPrimary),
        background: stripHash(colors.editorSyntaxKeyword),
        token: "invalid",
      },
      {
        foreground: stripHash(colors.contentPrimary),
        background: stripHash(colors.editorSyntaxConstant),
        token: "invalid.deprecated",
      },
      {
        foreground: stripHash(colors.contentPrimary),
        token: "meta.structure.dictionary.json string.quoted.double.json",
      },
      {
        foreground: stripHash(colors.interactionGuide),
        token: "meta.diff",
      },
      {
        foreground: stripHash(colors.interactionGuide),
        token: "meta.diff.header",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "markup.deleted",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token: "markup.inserted",
      },
      {
        foreground: stripHash(colors.editorSyntaxString),
        token: "markup.changed",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "constant.numeric.line-number.find-in-files - match",
      },
      {
        foreground: stripHash(colors.editorSyntaxString),
        token: "entity.name.filename",
      },
      {
        foreground: stripHash(colors.statusDanger),
        token: "message.error",
      },
      {
        foreground: stripHash(colors.contentPrimary),
        token:
          "punctuation.definition.string.begin.json - meta.structure.dictionary.value.json",
      },
      {
        foreground: stripHash(colors.contentPrimary),
        token:
          "punctuation.definition.string.end.json - meta.structure.dictionary.value.json",
      },
      {
        foreground: stripHash(colors.editorSyntaxType),
        token: "meta.structure.dictionary.json string.quoted.double.json",
      },
      {
        foreground: stripHash(colors.editorSyntaxString),
        token: "meta.structure.dictionary.value.json string.quoted.double.json",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token:
          "meta meta meta meta meta meta meta.structure.dictionary.value string",
      },
      {
        foreground: stripHash(colors.editorSyntaxVariable),
        token:
          "meta meta meta meta meta meta.structure.dictionary.value string",
      },
      {
        foreground: stripHash(colors.editorSyntaxKeyword),
        token: "meta meta meta meta meta.structure.dictionary.value string",
      },
      {
        foreground: stripHash(colors.editorSyntaxConstant),
        token: "meta meta meta meta.structure.dictionary.value string",
      },
      {
        foreground: stripHash(colors.editorSyntaxNumber),
        token: "meta meta meta.structure.dictionary.value string",
      },
      {
        foreground: stripHash(colors.editorSyntaxVariable),
        token: "meta meta.structure.dictionary.value string",
      },
    ],
    colors: {
      "activityBar.activeBackground": withAlpha(
        colors.editorSyntaxConstant,
        0.08,
      ),
      "activityBar.activeBorder": withAlpha(colors.editorSyntaxKeyword, 0.55),
      "activityBar.background": colors.controlSurfaceHover,
      "activityBar.foreground": colors.contentPrimary,
      "activityBar.inactiveForeground": colors.interactionGuide,
      "activityBarBadge.background": colors.editorSyntaxKeyword,
      "activityBarBadge.foreground": colors.contentPrimary,
      "badge.background": colors.editorSelection,
      "badge.foreground": colors.contentPrimary,
      "breadcrumb.activeSelectionForeground": colors.contentPrimary,
      "breadcrumb.background": mainBackground,
      "breadcrumb.focusForeground": colors.contentPrimary,
      "breadcrumb.foreground": colors.interactionGuide,
      "breadcrumbPicker.background": colors.editorBorder,
      "button.background": colors.editorSelection,
      "button.foreground": colors.contentPrimary,
      "button.secondaryBackground": mainBackground,
      "button.secondaryForeground": colors.contentPrimary,
      "button.secondaryHoverBackground": colors.controlSurfaceHover,
      "debugToolBar.background": colors.surfaceOverlay,
      "diffEditor.insertedTextBackground": withAlpha(
        colors.editorSyntaxNumber,
        0.12,
      ),
      "diffEditor.removedTextBackground": withAlpha(colors.statusDanger, 0.3),
      "dropdown.background": colors.controlSurfaceHover,
      "dropdown.border": colors.editorBorder,
      "dropdown.foreground": colors.contentPrimary,
      "editor.background": mainBackground,
      "editor.findMatchBackground": withAlpha(
        colors.editorSyntaxVariable,
        0.52,
      ),
      "editor.findMatchHighlightBackground": withAlpha(
        colors.contentPrimary,
        0.25,
      ),
      "editor.findRangeHighlightBackground": withAlpha(
        colors.editorSelectionAccent,
        0.48,
      ),
      "editor.foldBackground": colors.surfaceOverlay,
      "editor.foreground": colors.contentPrimary,
      "editor.hoverHighlightBackground": withAlpha(
        colors.editorSyntaxType,
        0.3,
      ),
      "editor.lineHighlightBorder": colors.editorActiveLineBorder,
      "editor.lineHighlightBackground": colors.editorActiveLine,
      "editor.rangeHighlightBackground": withAlpha(
        colors.editorSyntaxConstant,
        0.1,
      ),
      "editor.selectionBackground": colors.editorSelection,
      "editor.selectionHighlightBackground": colors.interactionNeutral,
      "editor.snippetFinalTabstopHighlightBackground": mainBackground,
      "editor.snippetFinalTabstopHighlightBorder": colors.editorSyntaxNumber,
      "editor.snippetTabstopHighlightBackground": mainBackground,
      "editor.snippetTabstopHighlightBorder": colors.interactionGuide,
      "editor.wordHighlightBackground": withAlpha(
        colors.editorSelectionAccent,
        0.7,
      ),
      "editor.wordHighlightStrongBackground": withAlpha(
        colors.editorSyntaxNumber,
        0.3,
      ),
      "editorBracketHighlight.foreground1": colors.contentPrimary,
      "editorBracketHighlight.foreground2": colors.editorSyntaxKeyword,
      "editorBracketHighlight.foreground3": colors.editorSyntaxType,
      "editorBracketHighlight.foreground4": colors.editorSyntaxNumber,
      "editorBracketHighlight.foreground5": colors.editorSyntaxConstant,
      "editorBracketHighlight.foreground6": colors.editorSyntaxVariable,
      "editorBracketHighlight.unexpectedBracket.foreground":
        colors.statusDanger,
      "editorCodeLens.foreground": colors.interactionGuide,
      "editorError.foreground": colors.statusDanger,
      "editorGroup.border": colors.editorSyntaxConstant,
      "editorGroup.dropBackground": withAlpha(
        colors.editorSelectionAccent,
        0.44,
      ),
      "editorGroupHeader.tabsBackground": colors.editorBorder,
      "editorGutter.addedBackground": withAlpha(colors.editorSyntaxNumber, 0.5),
      "editorGutter.deletedBackground": withAlpha(colors.statusDanger, 0.55),
      "editorGutter.modifiedBackground": withAlpha(
        colors.editorSyntaxType,
        0.55,
      ),
      "editorHoverWidget.background": mainBackground,
      "editorHoverWidget.border": colors.interactionGuide,
      "editorIndentGuide.activeBackground": withAlpha(
        colors.contentPrimary,
        0.28,
      ),
      "editorIndentGuide.background": withAlpha(colors.contentPrimary, 0.1),
      "editorLineNumber.foreground": colors.interactionGuide,
      "editorLink.activeForeground": colors.editorSyntaxType,
      "editorMarkerNavigation.background": colors.surfaceOverlay,
      "editorOverviewRuler.addedForeground": withAlpha(
        colors.editorSyntaxNumber,
        0.5,
      ),
      "editorOverviewRuler.border": colors.editorBorder,
      "editorOverviewRuler.currentContentForeground": colors.editorSyntaxNumber,
      "editorOverviewRuler.deletedForeground": withAlpha(
        colors.statusDanger,
        0.55,
      ),
      "editorOverviewRuler.errorForeground": withAlpha(
        colors.statusDanger,
        0.55,
      ),
      "editorOverviewRuler.incomingContentForeground":
        colors.editorSyntaxConstant,
      "editorOverviewRuler.infoForeground": withAlpha(
        colors.editorSyntaxType,
        0.55,
      ),
      "editorOverviewRuler.modifiedForeground": withAlpha(
        colors.editorSyntaxType,
        0.55,
      ),
      "editorOverviewRuler.selectionHighlightForeground":
        colors.editorSyntaxVariable,
      "editorOverviewRuler.warningForeground": withAlpha(
        colors.editorSyntaxVariable,
        0.52,
      ),
      "editorOverviewRuler.wordHighlightForeground": colors.editorSyntaxType,
      "editorOverviewRuler.wordHighlightStrongForeground":
        colors.editorSyntaxNumber,
      "editorRuler.foreground": withAlpha(colors.contentPrimary, 0.1),
      "editorSuggestWidget.background": colors.surfaceOverlay,
      "editorSuggestWidget.border": colors.editorBorder,
      "editorSuggestWidget.foreground": colors.contentPrimary,
      "editorSuggestWidget.highlightForeground": colors.contentAccent,
      "editorSuggestWidget.focusHighlightForeground":
        colors.editorSuggestionMatchActive,
      "editorSuggestWidget.selectedBackground":
        mode === "dark" ? listHoverBackground : colors.gridSelection,
      "editorSuggestWidget.selectedForeground": colors.contentPrimary,
      "editorSuggestWidgetStatus.foreground": colors.contentMuted,
      "editorWarning.foreground": colors.editorSyntaxType,
      "editorWhitespace.foreground": withAlpha(colors.contentPrimary, 0.1),
      "editorWidget.background": colors.surfaceInset,
      errorForeground: colors.statusDanger,
      "extensionButton.prominentBackground": withAlpha(
        colors.editorSyntaxNumber,
        0.65,
      ),
      "extensionButton.prominentForeground": colors.contentPrimary,
      "extensionButton.prominentHoverBackground": withAlpha(
        colors.editorSyntaxNumber,
        0.4,
      ),
      focusBorder: colors.interactionGuide,
      foreground: colors.contentPrimary,
      "gitDecoration.conflictingResourceForeground":
        colors.editorSyntaxVariable,
      "gitDecoration.deletedResourceForeground": colors.statusDanger,
      "gitDecoration.ignoredResourceForeground": colors.interactionGuide,
      "gitDecoration.modifiedResourceForeground": colors.editorSyntaxType,
      "gitDecoration.untrackedResourceForeground": colors.editorSyntaxNumber,
      "input.background": mainBackground,
      "input.border": colors.editorBorder,
      "input.foreground": colors.contentPrimary,
      "input.placeholderForeground": colors.interactionGuide,
      "inputOption.activeBorder": colors.editorSyntaxConstant,
      "inputValidation.errorBorder": colors.statusDanger,
      "inputValidation.infoBorder": colors.editorSyntaxKeyword,
      "inputValidation.warningBorder": colors.editorSyntaxVariable,
      "list.activeSelectionBackground": colors.editorSelection,
      "list.activeSelectionForeground": colors.contentPrimary,
      "list.dropBackground": colors.editorSelection,
      "list.errorForeground": colors.statusDanger,
      "list.focusBackground": listHoverBackground,
      "list.highlightForeground": colors.editorSyntaxType,
      "list.hoverBackground": listHoverBackground,
      "list.inactiveSelectionBackground": listHoverBackground,
      "list.warningForeground": colors.editorSyntaxVariable,
      "listFilterWidget.background": colors.controlSurfaceHover,
      "listFilterWidget.noMatchesOutline": colors.statusDanger,
      "listFilterWidget.outline": colors.interactionNeutral,
      "menu.background": colors.surfaceOverlay,
      "menu.border": colors.editorBorder,
      "menu.foreground": colors.contentPrimary,
      "menu.selectionBackground": colors.interactionHover,
      "menu.selectionForeground": colors.contentPrimary,
      "menu.separatorBackground": colors.interactionNeutral,
      "merge.currentHeaderBackground": withAlpha(
        colors.editorSyntaxNumber,
        0.65,
      ),
      "merge.incomingHeaderBackground": withAlpha(
        colors.editorSyntaxConstant,
        0.65,
      ),
      "panel.background": mainBackground,
      "panel.border": colors.editorSyntaxConstant,
      "panelTitle.activeBorder": colors.editorSyntaxKeyword,
      "panelTitle.activeForeground": colors.contentPrimary,
      "panelTitle.inactiveForeground": colors.interactionGuide,
      "peekView.border": colors.editorSelection,
      "peekViewEditor.background": mainBackground,
      "peekViewEditor.matchHighlightBackground": withAlpha(
        colors.editorSyntaxString,
        0.52,
      ),
      "peekViewResult.background": colors.surfaceOverlay,
      "peekViewResult.fileForeground": colors.contentPrimary,
      "peekViewResult.lineForeground": colors.contentPrimary,
      "peekViewResult.matchHighlightBackground": withAlpha(
        colors.editorSyntaxString,
        0.52,
      ),
      "peekViewResult.selectionBackground": colors.editorSelection,
      "peekViewResult.selectionForeground": colors.contentPrimary,
      "peekViewTitle.background": colors.editorBorder,
      "peekViewTitleDescription.foreground": colors.interactionGuide,
      "peekViewTitleLabel.foreground": colors.contentPrimary,
      "pickerGroup.border": colors.editorSyntaxConstant,
      "pickerGroup.foreground": colors.editorSyntaxType,
      "progressBar.background": colors.editorSyntaxKeyword,
      "quickInput.background": colors.surfaceOverlay,
      "quickInput.foreground": colors.contentPrimary,
      "quickInputList.focusBackground": listHoverBackground,
      "quickInputList.focusForeground": colors.contentPrimary,
      "quickInputTitle.background": colors.surfaceOverlay,
      "selection.background": colors.editorSyntaxConstant,
      "settings.checkboxBackground": colors.surfaceOverlay,
      "settings.checkboxBorder": colors.editorBorder,
      "settings.checkboxForeground": colors.contentPrimary,
      "settings.dropdownBackground": colors.surfaceOverlay,
      "settings.dropdownBorder": colors.editorBorder,
      "settings.dropdownForeground": colors.contentPrimary,
      "settings.headerForeground": colors.contentPrimary,
      "settings.modifiedItemIndicator": colors.editorSyntaxVariable,
      "settings.numberInputBackground": colors.surfaceOverlay,
      "settings.numberInputBorder": colors.editorBorder,
      "settings.numberInputForeground": colors.contentPrimary,
      "settings.textInputBackground": colors.surfaceOverlay,
      "settings.textInputBorder": colors.editorBorder,
      "settings.textInputForeground": colors.contentPrimary,
      "sideBar.background": colors.surfaceOverlay,
      "sideBarSectionHeader.background": mainBackground,
      "sideBarSectionHeader.border": colors.editorBorder,
      "sideBarTitle.foreground": colors.contentPrimary,
      "statusBar.background": colors.editorBorder,
      "statusBar.debuggingBackground": colors.statusDanger,
      "statusBar.debuggingForeground": colors.editorBorder,
      "statusBar.foreground": colors.contentPrimary,
      "statusBar.noFolderBackground": colors.editorBorder,
      "statusBar.noFolderForeground": colors.contentPrimary,
      "statusBarItem.prominentBackground": colors.statusDanger,
      "statusBarItem.prominentHoverBackground": colors.editorSyntaxVariable,
      "statusBarItem.remoteBackground": colors.editorSyntaxConstant,
      "statusBarItem.remoteForeground": mainBackground,
      "tab.activeBackground": mainBackground,
      "tab.activeBorderTop": withAlpha(colors.editorSyntaxKeyword, 0.55),
      "tab.activeForeground": colors.contentPrimary,
      "tab.border": colors.editorBorder,
      "tab.inactiveBackground": colors.surfaceOverlay,
      "tab.inactiveForeground": colors.interactionGuide,
      "terminal.ansiBlack": colors.surfaceOverlay,
      "terminal.ansiBlue": colors.editorSyntaxConstant,
      "terminal.ansiBrightBlack": colors.interactionGuide,
      "terminal.ansiBrightBlue": colors.statusFeature,
      "terminal.ansiBrightCyan": colors.statusInfo,
      "terminal.ansiBrightGreen": colors.statusSuccess,
      "terminal.ansiBrightMagenta": colors.contentAccent,
      "terminal.ansiBrightRed": colors.statusDanger,
      "terminal.ansiBrightWhite": colors.contentInverse,
      "terminal.ansiBrightYellow": colors.statusAttention,
      "terminal.ansiCyan": colors.editorSyntaxType,
      "terminal.ansiGreen": colors.editorSyntaxNumber,
      "terminal.ansiMagenta": colors.editorSyntaxKeyword,
      "terminal.ansiRed": colors.statusDanger,
      "terminal.ansiWhite": colors.contentPrimary,
      "terminal.ansiYellow": colors.editorSyntaxString,
      "terminal.background": mainBackground,
      "terminal.foreground": colors.contentPrimary,
      "titleBar.activeBackground": colors.surfaceOverlay,
      "titleBar.activeForeground": colors.contentPrimary,
      "titleBar.inactiveBackground": colors.editorBorder,
      "titleBar.inactiveForeground": colors.interactionGuide,
      "walkThrough.embeddedEditorBackground": colors.surfaceOverlay,
    },
  }

  return Dracula
}

export default createDraculaTheme
