import { deleteListMessage } from '../../vk/listMessage.js'

export async function runCloseEvent({ vk, store, peerId }) {
  const lastId = store.getLastEventId(peerId)
  if (!lastId) return false

  const event = store.getEvent(lastId)
  if (event) {
    try {
      await deleteListMessage(vk, { peerId, event })
    } catch {
      // закрываем состояние даже если удалить сообщение не удалось
    }
  }

  store.deleteEvent(lastId)
  return true
}

