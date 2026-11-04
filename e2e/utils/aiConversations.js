const createChat = ({
  name = "Test Chat",
  userMessage = "Test message",
  sql,
} = {}) => ({
  conversationName: name,
  ...(sql ? { currentSQL: sql } : {}),
  messages: [
    { role: "user", content: userMessage },
    {
      role: "assistant",
      content: "Test response",
      ...(sql ? { sql, previousSQL: "" } : {}),
    },
  ],
})

const createQueryChat = ({ bufferId, query, ...chatOptions }) => {
  const queryText = query.trim().replace(/;$/, "").trim()
  const chat = createChat(chatOptions)
  return {
    ...chat,
    messages: chat.messages.map((message) =>
      message.sql ? { ...message, previousSQL: queryText } : message,
    ),
    bufferId,
    queryKey: `${queryText}@0-${queryText.length}`,
    currentSQL: chatOptions.sql ?? queryText,
  }
}

module.exports = { createChat, createQueryChat }
