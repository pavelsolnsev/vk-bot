import { logError } from '../../utils/botLog.js'
import { sendCallbackAnswer, vkShowSnackbarEventData } from '../../vk/callbackAnswer.js'
import { sendEphemeralPeer } from '../../vk/sendEphemeralPeer.js'
import { joinEvent, leaveEvent } from '../../services/roster.js'
import { normalizeButtonPayload } from './normalizeButtonPayload.js'
import { refreshList } from '../commands/context.js'
import {
  notifyPromotedToMain,
  notifyAdminsPlayerJoined,
  notifyAdminsPlayerLeft,
} from '../../services/dmNotifications.js'
import { syncFootballAfterJoin } from '../../services/footballRosterSync.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'

export async function handleEventButton({ vk, store, ctx }) {
  const payload = normalizeButtonPayload(ctx.eventPayload)
  if (!payload) return

  // Подсказка только нажавшему: snackbar (часть клиентов) + ЛС «пользователь ↔ сообщество» (телефоны, где snackbar нет).
  let userNoticeText = null

  const event = store.getEvent(payload.gameEventId)
  if (!event) {
    await sendCallbackAnswer(vk, ctx, {})
    return
  }

  if (payload.cmd === 'join') {
    const res = joinEvent(event, ctx.userId, { team: payload.team })
    const rolledBack = await syncFootballAfterJoin(vk, ctx.userId, res, {
      event,
      team: payload.team,
      onBlocked: () => {
        userNoticeText = '⚠️ Идёт live-матч, запись в турнир на сайте закрыта.'
      },
    })
    if (res?.status === 'noop') {
      // Уже в основе или в очереди — подсказка только нажавшему (snackbar).
      userNoticeText = event.participants.has(ctx.userId)
        ? 'Вы уже в основном составе.'
        : 'Вы уже в очереди.'
    } else if (res?.status === 'queue' && !rolledBack) {
      userNoticeText = '📢 Вы записаны в очередь.'
    }
    if ((res?.status === 'main' || res?.status === 'queue') && !rolledBack) {
      // Ошибка ЛС админам не должна ломать нажатие кнопки «Играть».
      try {
        await notifyAdminsPlayerJoined(vk, {
          userId: ctx.userId,
          source: 'play_button',
          rosterStatus: res.status,
        })
      } catch (err) {
        logError('handleEventButton/notifyJoined', err, { userId: ctx.userId })
      }
    }
  } else if (payload.cmd === 'leave') {
    const uid = ctx.userId
    const inRoster = event.participants.has(uid) || event.queue.has(uid)
    if (!inRoster) {
      userNoticeText = 'Вас нет в списке записи.'
    } else {
      // Сначала сайт — при live не трогаем список ВК (иначе пришлось бы откатывать сложнее).
      const apiRes = await removePlayerFromFootballSite({ vkUserId: uid })
      if (apiRes?.tournamentLive) {
        userNoticeText = '⚠️ Идёт live-матч, выход из турнира на сайте закрыт.'
      } else {
        const res = leaveEvent(event, uid)
        if (res?.promoted?.length) {
          await notifyPromotedToMain(vk, res.promoted)
        }
        // Ошибка ЛС админам не должна ломать нажатие кнопки «Выйти».
        try {
          await notifyAdminsPlayerLeft(vk, {
            userId: uid,
            source: 'leave_button',
            leftFrom: res.leftFrom,
          })
        } catch (err) {
          logError('handleEventButton/notifyLeft', err, { userId: uid })
        }
      }
    }
  }

  // conversation_message_id — ID сообщения, к которому прикреплена кнопка.
  const cmid = ctx.conversationMessageId ?? ctx.payload?.conversation_message_id ?? ctx.payload?.cmid ?? null
  if (cmid != null && typeof cmid === 'number' && cmid > 0) {
    event.listConversationMessageId = cmid
  }

  const answerOpts = userNoticeText ? { eventData: vkShowSnackbarEventData(userNoticeText) } : {}

  try {
    await refreshList({ vk, store, context: ctx, event })
  } catch (err) {
    logError('handleEventButton/refreshList', err, { gameEventId: event?.id })
    await sendCallbackAnswer(vk, ctx, answerOpts)
    if (userNoticeText) {
      await sendEphemeralPeer(vk, ctx.userId, userNoticeText, 5000)
    }
    return
  }

  await sendCallbackAnswer(vk, ctx, answerOpts)
  if (userNoticeText) {
    await sendEphemeralPeer(vk, ctx.userId, userNoticeText, 5000)
  }
}
