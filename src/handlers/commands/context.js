import { buildEventKeyboard } from '../../vk/keyboard.js'
import { syncEventListMessage } from '../../vk/listMessage.js'
import { buildEventListMessageBody } from '../../services/eventListText.js'

export async function refreshList({ vk, store, context, event }) {
  const text = await buildEventListMessageBody(vk, store.userNameCache, event)
  const keyboard = buildEventKeyboard(event)
  await syncEventListMessage({ vk, context, event, text, keyboard })
}

/** Обновить список без живого MessageContext (поллинг сайта — достаточно peer_id). */
export async function refreshListForEvent({ vk, store, event }) {
  const context = { peerId: event.peerId }
  return refreshList({ vk, store, context, event })
}

