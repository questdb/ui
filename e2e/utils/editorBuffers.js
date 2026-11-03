const createNotebookBuffer = (sql) => ({
  label: "Notebook 1",
  notebookViewState: {
    cells: [
      { id: "test-cell", position: 0, value: sql, paneView: "editor_result" },
    ],
    focusedCellId: "test-cell",
  },
})

const seedEditorBuffers = (win, buffers, activeBufferId) =>
  new Cypress.Promise((resolve, reject) => {
    // Seed the original Dexie schema (native version 10); the app applies migrations.
    // Queue this before the app opens IndexedDB, after the visit helper's reset.
    const request = win.indexedDB.open("web-console", 10)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error("Editor fixture database is blocked"))
    request.onupgradeneeded = () => {
      const database = request.result
      const bufferStore = database.createObjectStore("buffers", {
        keyPath: "id",
        autoIncrement: true,
      })
      bufferStore.createIndex("label", "label")
      const settings = database.createObjectStore("editor_settings", {
        keyPath: "id",
        autoIncrement: true,
      })
      settings.createIndex("key", "key")

      let lastOpenBufferId
      buffers.forEach((buffer, index) => {
        const id = index + 1
        bufferStore.add({
          id,
          label: index === 0 ? "SQL" : `SQL ${index}`,
          value: "",
          editorViewState:
            buffer.metricsViewState || buffer.notebookViewState
              ? undefined
              : {
                  cursorState: [
                    {
                      inSelectionMode: false,
                      selectionStart: { lineNumber: 1, column: 1 },
                      position: { lineNumber: 1, column: 1 },
                    },
                  ],
                  viewState: {
                    scrollLeft: 0,
                    firstPosition: { lineNumber: 1, column: 1 },
                    firstPositionDeltaTop: 0,
                  },
                  contributionsState: {},
                },
          ...buffer,
        })
        if (!buffer.archived) lastOpenBufferId = id
      })
      settings.add({
        key: "activeBufferId",
        value: activeBufferId ?? lastOpenBufferId,
      })
      settings.add({ key: "returnTo", value: "" })
      settings.add({ key: "returnToLabel", value: "" })
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
  })

module.exports = { seedEditorBuffers, createNotebookBuffer }
