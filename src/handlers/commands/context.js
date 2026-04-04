import { buildEventKeyboard } from '../../vk/keyboard.js'
import { syncEventListMessage } from '../../vk/listMessage.js'
import { buildEventListMessageBody } from '../../services/eventListText.js'

export async function refreshList({ vk, store, context, event }) {
  const text = await buildEventListMessageBody(vk, store.userNameCache, event)
  const keyboard = buildEventKeyboard(event.id)
  await syncEventListMessage({ vk, context, event, text, keyboard })
}

