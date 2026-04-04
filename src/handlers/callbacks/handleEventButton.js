import { sendCallbackAnswer } from '../../vk/callbackAnswer.js'
import { joinEvent, leaveEvent } from '../../services/roster.js'
import { normalizeButtonPayload } from './normalizeButtonPayload.js'
import { refreshList } from '../commands/context.js'
import { notifyJoinedQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'

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
  } else if (payload.cmd === 'leave') {
    const res = leaveEvent(event, ctx.userId)
    if (res?.promoted?.length) {
      await notifyPromotedToMain(vk, res.promoted)
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

