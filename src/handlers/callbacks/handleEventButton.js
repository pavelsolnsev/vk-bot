import { logError } from '../../utils/botLog.js'
import { sendCallbackAnswer, vkShowSnackbarEventData } from '../../vk/callbackAnswer.js'
import { joinEvent, leaveEvent } from '../../services/roster.js'
import { normalizeButtonPayload } from './normalizeButtonPayload.js'
import { refreshList } from '../commands/context.js'
import { notifyPromotedToMain } from '../../services/dmNotifications.js'
import { syncFootballAfterJoin } from '../../services/footballRosterSync.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'

export async function handleEventButton({ vk, store, ctx }) {
  const payload = normalizeButtonPayload(ctx.eventPayload)
  if (!payload) return

  // Текст для show_snackbar — видит только нажавший кнопку.
  let snackbarText = null

  const event = store.getEvent(payload.gameEventId)
  if (!event) {
    await sendCallbackAnswer(vk, ctx, {})
    return
  }

  if (payload.cmd === 'join') {
    const res = joinEvent(event, ctx.userId)
    const rolledBack = await syncFootballAfterJoin(vk, ctx.userId, res, {
      event,
      onBlocked: () => {
        snackbarText = '⚠️ Идёт live-матч, запись в турнир на сайте закрыта.'
      },
    })
    if (res?.status === 'noop') {
      // Уже в основе или в очереди — подсказка только нажавшему (snackbar).
      snackbarText = event.participants.has(ctx.userId)
        ? 'Вы уже в основном составе.'
        : 'Вы уже в очереди.'
    } else if (res?.status === 'queue' && !rolledBack) {
      snackbarText = '📢 Вы записаны в очередь.'
    }
  } else if (payload.cmd === 'leave') {
    const uid = ctx.userId
    const inRoster = event.participants.has(uid) || event.queue.has(uid)
    if (!inRoster) {
      snackbarText = 'Вас нет в списке записи.'
    } else {
      // Сначала сайт — при live не трогаем список ВК (иначе пришлось бы откатывать сложнее).
      const apiRes = await removePlayerFromFootballSite({ vkUserId: uid })
      if (apiRes?.tournamentLive) {
        snackbarText = '⚠️ Идёт live-матч, выход из турнира на сайте закрыт.'
      } else {
        const res = leaveEvent(event, uid)
        if (res?.promoted?.length) {
          await notifyPromotedToMain(vk, res.promoted)
        }
      }
    }
  }

  // conversation_message_id — ID сообщения, к которому прикреплена кнопка.
  const cmid = ctx.conversationMessageId ?? ctx.payload?.conversation_message_id ?? ctx.payload?.cmid ?? null
  if (cmid != null && typeof cmid === 'number' && cmid > 0) {
    event.listConversationMessageId = cmid
  }

  const snackbarOpts = snackbarText ? { eventData: vkShowSnackbarEventData(snackbarText) } : {}

  try {
    await refreshList({ vk, store, context: ctx, event })
  } catch (err) {
    logError('handleEventButton/refreshList', err, { gameEventId: event?.id })
    await sendCallbackAnswer(vk, ctx, snackbarOpts)
    return
  }

  await sendCallbackAnswer(vk, ctx, snackbarOpts)
}
