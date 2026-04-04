import { handleEventButton } from './callbacks/handleEventButton.js'

export function createMessageEventHandler({ vk, store }) {
  return async (ctx) => {
    await handleEventButton({ vk, store, ctx })
  }
}
