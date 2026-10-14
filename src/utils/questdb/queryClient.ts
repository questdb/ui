import { Client } from "./client"

// Console and telemetry SQL share credentials and refresh handling. Configure
// this instance in QuestProvider before starting any store telemetry epics.
export const questClient = new Client()
