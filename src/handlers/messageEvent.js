import { handleEventButton } from './callbacks/handleEventButton.js'
import { logError } from '../utils/botLog.js'

export function createMessageEventHandler({ vk, store }) {
  return async (ctx) => {
    try {
      await handleEventButton({ vk, store, ctx })
    } catch (err) {
      logError('message_event/handleEventButton', err)
    }
  }
}
