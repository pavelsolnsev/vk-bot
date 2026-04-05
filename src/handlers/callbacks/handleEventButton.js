import { sendCallbackAnswer } from '../../vk/callbackAnswer.js'
import { joinEvent, leaveEvent } from '../../services/roster.js'
import { normalizeButtonPayload } from './normalizeButtonPayload.js'
import { refreshList } from '../commands/context.js'
import { notifyJoinedQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'
import { registerPlayerOnFootballSite, removePlayerFromFootballSite } from '../../services/footballApi.js'

export async function handleEventButton({ vk, store, ctx }) {
  const payload = normalizeButtonPayload(ctx.eventPayload)
  if (!payload) return

  const event = store.getEvent(payload.gameEventId)
  if (!event) {
    await sendCallbackAnswer(vk, ctx, {})
    return
  }

  if (payload.cmd === 'join') {
    const res = joinEvent(event, ctx.userId)
    if (res?.status === 'queue') {
      await notifyJoinedQueue(vk, ctx.userId)
    }

    // Получаем имя пользователя из ВК и регистрируем его на football-сайте.
    // Делаем это только если игрок реально добавился (не был уже в списке).
    if (res?.status === 'main' || res?.status === 'queue') {
      try {
        // vk.api.users.get возвращает массив — берём первого пользователя.
        const users = await vk.api.users.get({ user_ids: [ctx.userId] })
        const user = users?.[0]
        if (user) {
          await registerPlayerOnFootballSite({
            vkUserId: ctx.userId,
            firstName: user.first_name ?? '',
            lastName: user.last_name ?? '',
          })
        }
      } catch {
        // Не ломаем бота если не удалось получить имя.
      }
    }
  } else if (payload.cmd === 'leave') {
    const res = leaveEvent(event, ctx.userId)
    if (res?.promoted?.length) {
      await notifyPromotedToMain(vk, res.promoted)
    }

    // Убираем игрока с football-сайта только если он реально вышел из списка или очереди.
    if (res?.leftFrom === 'main' || res?.leftFrom === 'queue') {
      try {
        await removePlayerFromFootballSite({ vkUserId: ctx.userId })
      } catch {
        // football API недоступен — список ВК уже обновлён
      }
    }
  }

  // conversation_message_id — ID сообщения, к которому прикреплена кнопка.
  const cmid = ctx.conversationMessageId ?? ctx.payload?.conversation_message_id ?? ctx.payload?.cmid ?? null
  if (cmid != null && typeof cmid === 'number' && cmid > 0) {
    event.listConversationMessageId = cmid
  }

  try {
    await refreshList({ vk, store, context: ctx, event })
  } catch {
    await sendCallbackAnswer(vk, ctx, {})
    return
  }

  await sendCallbackAnswer(vk, ctx, {})
}

