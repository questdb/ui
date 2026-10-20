import { Client } from "./client"
import { authSessionState } from "../../modules/OAuth2/authSessionState"

// Console and telemetry SQL share credentials and refresh handling. Configure
// this instance in QuestProvider before starting any store telemetry epics.
export const questClient = new Client()
authSessionState.onEnd(() => {
  questClient.abortForSessionEnd()
  questClient.resetCredentials()
})
