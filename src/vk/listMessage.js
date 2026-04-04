import { resolveGroupIdForApi } from './groupId.js'
import { stripDuplicateListBlocks } from '../format/stripDuplicateListBlocks.js'

const randomSendId = () => Math.floor(Math.random() * 10000) * Date.now()

/**
 * Первое сообщение со списком.
 * Шлём через API с явным peer_id, сохраняем conversation_message_id и message_id.
 */
export async function sendListMessage(vk, context, event, { text, keyboard }) {
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    message: stripDuplicateListBlocks(text),
    random_id: randomSendId(),
    keyboard: keyboard.toString(),
  }
  if (groupId != null) {
    params.group_id = groupId
    // Для запросов "от имени сообщества" (group_id) VK возвращает расширенный ответ
    // только при использовании peer_ids (см. поведение vk-io MessageContext.send).
    params.peer_ids = context.peerId
  } else {
    params.peer_id = context.peerId
  }

  const raw = await vk.api.messages.send(params)

  // peer_ids → массив [{ peer_id, message_id, conversation_message_id, ... }]
  if (Array.isArray(raw) && raw.length > 0) {
    const item = raw[0]
    if (item && typeof item === 'object') {
      const cmid = item.conversation_message_id ?? null
      const mid = item.message_id ?? null
      event.listConversationMessageId = typeof cmid === 'number' && cmid > 0 ? cmid : null
      event.listMessageId = typeof mid === 'number' && mid > 0 ? mid : null
      return
    }
  }

  // peer_id → просто message_id (число)
  if (typeof raw === 'number') {
    event.listMessageId = raw > 0 ? raw : null
    event.listConversationMessageId = null
    return
  }
}

/**
 * Редактировать сообщение со списком — используем conversation_message_id если есть, иначе message_id.
 */
export async function editListMessage(vk, { peerId, event, text, keyboard }) {
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    peer_id: peerId,
    message: stripDuplicateListBlocks(text),
    keyboard: keyboard.toString(),
  }

  if (event.listConversationMessageId != null) {
    params.conversation_message_id = event.listConversationMessageId
  } else if (event.listMessageId != null) {
    params.message_id = event.listMessageId
  } else {
    throw new Error('no message id to edit')
  }

  if (groupId != null) {
    params.group_id = groupId
  }

  await vk.api.messages.edit(params)
}

/**
 * Одно «главное» сообщение: первый раз send, далее только edit.
 */
export async function syncEventListMessage({ vk, context, event, text, keyboard }) {
  const hasId = event.listConversationMessageId != null || event.listMessageId != null

  if (!hasId) {
    await sendListMessage(vk, context, event, { text, keyboard })
    return
  }

  try {
    await editListMessage(vk, { peerId: event.peerId, event, text, keyboard })
  } catch (e) {
    console.error('messages.edit failed (no-fallback-send):', e?.message || e)
  }
}

/**
 * Удалить сообщение со списком (если оно было отправлено).
 */
export async function deleteListMessage(vk, { peerId, event }) {
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    peer_id: peerId,
    delete_for_all: 1,
  }

  const cmid = event.listConversationMessageId
  const mid = event.listMessageId

  if (cmid != null && cmid > 0) {
    // Для messages.delete в беседах используется параметр `cmids`
    params.cmids = [cmid]
  } else if (mid != null && mid > 0) {
    params.message_ids = [mid]
  } else {
    // Нет валидного идентификатора сообщения — удалять нечего
    console.error('[delete list] no valid message id to delete', {
      peerId,
      cmid,
      mid,
    })
    return
  }

  if (groupId != null) {
    params.group_id = groupId
  }

  await vk.api.messages.delete(params)
}
