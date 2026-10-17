import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { QueryExecutionManager } from "./queryExecutionManager"

export const questExecution = new QueryExecutionManager()
authSessionState.onEnd(questExecution.reset)
