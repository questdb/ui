const { compressSync, strToU8 } = require("fflate")

const seedConsoleStorage = (
  win,
  { buffers = [{}], activeBufferId, conversations = [] },
) =>
  new Cypress.Promise((resolve, reject) => {
    // Dexie versions 1 and 4 map to native versions 10 and 40.
    // The app applies the remaining migrations after these fixtures are written.
    // Queue this before the app opens IndexedDB, after the visit helper's reset.
    const request = win.indexedDB.open(
      "web-console",
      conversations.length ? 40 : 10,
    )
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error("Console fixture database is blocked"))
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
          position: index,
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

      if (conversations.length) {
        for (const key of ["position", "archived", "archivedAt"]) {
          bufferStore.createIndex(key, key)
        }
        database
          .createObjectStore("read_notifications", {
            keyPath: "id",
            autoIncrement: true,
          })
          .createIndex("newsId", "newsId")
        const conversationStore = database.createObjectStore(
          "ai_conversations",
          {
            keyPath: "id",
          },
        )
        for (const key of ["bufferId", "tableId", "updatedAt", "queryKey"]) {
          conversationStore.createIndex(key, key)
        }
        const messageStore = database.createObjectStore(
          "ai_conversation_messages",
          {
            keyPath: "conversationId",
          },
        )
        const timestamp = Date.now()
        conversations.forEach(({ messages, ...meta }, index) => {
          const id = meta.id ?? `conversation-${index + 1}`
          const persistedMessages = messages.map((message, messageIndex) => ({
            id: `${id}-message-${messageIndex + 1}`,
            timestamp: timestamp + messageIndex,
            ...message,
          }))
          conversationStore.add({ id, updatedAt: timestamp + index, ...meta })
          messageStore.add({
            conversationId: id,
            data: compressSync(strToU8(JSON.stringify(persistedMessages))),
          })
        })
      }
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
  })

module.exports = { seedConsoleStorage }
