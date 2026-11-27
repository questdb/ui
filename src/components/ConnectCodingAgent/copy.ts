// Copy shared by every surface that offers to connect a coding agent, so the
// footer popover, the connect dialog and the notebook surfaces say the same.
// Two ways: the agent works in the AI Assistant (`connect`, offered first),
// or it works from the user's terminal (`setup`, then the agent connects).
// Keep it short: a title per way and the command; details stay folded.

export const AGENT_VALUE =
  "Analyze your data, monitor your instance and build dashboards with the coding agent you already have."

export const IN_AI_ASSISTANT = {
  title: "Use your agent here",
}

export const FROM_TERMINAL = {
  title: "Use your agent in your terminal",
  then: "Then ask your agent to connect to the QuestDB Web Console.",
}
