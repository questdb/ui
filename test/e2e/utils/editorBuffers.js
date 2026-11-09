const createNotebookBuffer = (sql) => ({
  label: "Notebook 1",
  notebookViewState: {
    cells: [
      { id: "test-cell", position: 0, value: sql, paneView: "editor_result" },
    ],
    focusedCellId: "test-cell",
  },
})

module.exports = { createNotebookBuffer }
