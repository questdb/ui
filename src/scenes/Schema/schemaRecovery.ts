import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

type Recovery = () => Promise<unknown> | undefined

const recoveries = new Set<Recovery>()
let activeBatch: object | undefined

const onConnectionOK = () => {
  if (activeBatch) return
  const batch = {}
  activeBatch = batch
  // Console and the mobile SideMenu can both own a Schema. Recover all
  // registered panels in one batch so neither retries from its peer's OKs,
  // including table-detail responses that finish after columns have failed.
  void Promise.allSettled(
    [...recoveries].map((recover) =>
      Promise.resolve().then(() =>
        recoveries.has(recover) ? recover() : undefined,
      ),
    ),
  ).then(() => {
    if (activeBatch === batch) activeBatch = undefined
  })
}

export const subscribeSchemaRecovery = (recover: Recovery) => {
  if (recoveries.size === 0) {
    eventBus.subscribe(EventType.MSG_CONNECTION_OK, onConnectionOK)
  }
  recoveries.add(recover)
  return () => {
    recoveries.delete(recover)
    if (recoveries.size === 0) {
      eventBus.unsubscribe(EventType.MSG_CONNECTION_OK, onConnectionOK)
      // A removed owner's pending requests must not block a new owner. Its
      // eventual completion also must not release a newer batch's guard.
      activeBatch = undefined
    }
  }
}
