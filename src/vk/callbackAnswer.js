import { resolveGroupIdForApi } from './groupId.js'

/**
 * Ответ на нажатие callback-кнопки (иначе крутится индикатор).
 * Нельзя «пропускать» event_data: для снятия загрузки нужна явная пустая строка
 * event_data="" (см. ответы по sendMessageEventAnswer). Иначе VK может вернуть
 * misleading ошибку вида invalid event_id.
 */
export async function sendCallbackAnswer(vk, ctx, { eventData } = {}) {
  const eventId =
    ctx.eventId ?? ctx.payload?.event_id ?? ctx.payload?.eventId ?? ctx.payload?.id
  const peerId = ctx.peerId ?? ctx.payload?.peer_id
  const userId = ctx.userId ?? ctx.payload?.user_id

  if (eventId == null || peerId == null || userId == null) {
    console.error('sendCallbackAnswer: missing fields', { eventId, peerId, userId })
    return
  }

  const groupId = ctx.$groupId ?? resolveGroupIdForApi(vk)

  let preferredEventData = ''
  if (eventData !== undefined && eventData !== null) {
    preferredEventData = typeof eventData === 'string' ? eventData : JSON.stringify(eventData)
  }

  const eventDataAttempts = []
  if (preferredEventData !== '') {
    eventDataAttempts.push(preferredEventData)
  }
  eventDataAttempts.push('')

  const groupAttempts = []
  if (groupId != null) {
    groupAttempts.push({ group_id: groupId })
  }
  groupAttempts.push({})

  let lastError
  for (const ed of eventDataAttempts) {
    for (const extra of groupAttempts) {
      const params = {
        event_id: String(eventId),
        peer_id: peerId,
        user_id: userId,
        event_data: ed,
        ...extra,
      }
      try {
        await vk.api.messages.sendMessageEventAnswer(params)
        return
      } catch (e) {
        lastError = e
      }
    }
  }

  console.error(
    'sendMessageEventAnswer: все попытки не удались',
    lastError?.message || lastError,
    { event_id: String(eventId), peerId, userId },
  )
}
