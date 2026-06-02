import { logError } from '../../utils/botLog.js'
import { sendCallbackAnswer, vkShowSnackbarEventData } from '../../vk/callbackAnswer.js'
import { sendEphemeralPeer } from '../../vk/sendEphemeralPeer.js'
import { joinEvent, leaveEvent } from '../../services/roster.js'
import { normalizeButtonPayload } from './normalizeButtonPayload.js'
import { scheduleListRefresh } from '../../services/listRefreshDebounce.js'
import {
  notifyPromotedToMain,
  notifyAdminsPlayerJoined,
  notifyAdminsPlayerLeft,
  notifyAdminsJoinBlocked,
} from '../../services/dmNotifications.js'
import { syncFootballAfterJoin } from '../../services/footballRosterSync.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'
import { sendPrivateMessage } from '../../vk/sendPrivateMessage.js'
import { eventListLocations } from '../../format/eventListLocations.js'

const PAYMENT_INFO_TEXT =
  '💳 Сбербанк (Павел С.):\n89166986185\n\n❗ В комментарии укажи свой ник из списка'

function resolveEventSum(event) {
  const key = String(event?.place ?? '').trim().toLowerCase()
  return eventListLocations[key]?.sum ?? null
}

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

  if (payload.cmd === 'payment_info') {
    const sum = resolveEventSum(event)
    const sumPart = sum != null ? ` · ${sum} ₽` : ''
    const base = `💳 Сбербанк: 89166986185 (Павел С.)${sumPart}`

    // Пробуем отправить в ЛС — по ошибке определяем что показать пользователю.
    let snackbar = `${base} — скопировать телефон можно в списке`
    let chatHint = null
    try {
      await sendPrivateMessage(vk, ctx.userId, PAYMENT_INFO_TEXT)
    } catch (err) {
      const code = err?.code ?? err?.errorCode
      if (code === 902) {
        // Пользователь заблокировал сообщения от группы.
        snackbar = '⚠️ Ты заблокировал бота — смотри подсказку ниже'
        chatHint =
          `👤 Только для тебя (сообщение исчезнет):\n\n` +
          `Ты заблокировал сообщения от нашей группы, поэтому номер не может прийти в личку.\n\n` +
          `Как исправить:\n` +
          `1. Открой страницу группы — vk.com/rmsfootball\n` +
          `2. Нажми кнопку «Написать сообщение»\n` +
          `3. Появится кнопка «Разблокировать» — нажми её\n` +
          `4. Вернись в чат и нажми «💳 Номер для оплаты» снова\n\n` +
          `Номер придёт в личку.`
      } else if (code === 900 || code === 901) {
        // Пользователь ни разу не писал боту — нет разрешения на ЛС.
        snackbar = 'ℹ️ Разреши боту писать тебе — смотри подсказку ниже'
        chatHint =
          `👤 Только для тебя (сообщение исчезнет):\n\n` +
          `Чтобы получать сообщения от бота в личку, нужно один раз написать ему:\n\n` +
          `1. Открой страницу группы — vk.com/rmsfootball\n` +
          `2. Нажми кнопку «Написать сообщение»\n` +
          `3. Напиши любое слово, например: Привет\n` +
          `4. Вернись в чат и нажми «💳 Номер для оплаты» снова\n\n` +
          `Номер придёт в личку.`
      } else {
        // Другая ошибка — просто показываем номер в снэкбаре.
        snackbar = base
      }
    }

    await sendCallbackAnswer(vk, ctx, { eventData: vkShowSnackbarEventData(snackbar) })

    // Временное сообщение в чат с инструкцией — автоудаляется через 20 секунд.
    if (chatHint) {
      try {
        await sendEphemeralPeer(vk, ctx.peerId, chatHint, 20000)
      } catch {
        // Не критично — снэкбар уже показан.
      }
    }
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
    } else if (res?.status === 'main' && !rolledBack) {
      // Подтверждение основного места — видно сразу, пока список обновляется.
      userNoticeText = '✅ Вы записаны!'
    } else if (res?.status === 'queue' && !rolledBack) {
      userNoticeText = '📢 Вы записаны в очередь.'
    }
    if ((res?.status === 'main' || res?.status === 'queue') && !rolledBack) {
      // Ошибка ЛС админам не должна ломать нажатие кнопки «Играть».
      try {
        await notifyAdminsPlayerJoined(vk, {
          userId: ctx.userId,
          rosterStatus: res.status,
          team: payload.team,
        })
      } catch (err) {
        logError('handleEventButton/notifyJoined', err, { userId: ctx.userId })
      }
    }
    if ((res?.status === 'main' || res?.status === 'queue') && rolledBack) {
      // Игрок попытался записаться, но сайт в live-режиме — join откатили.
      try {
        await notifyAdminsJoinBlocked(vk, {
          userId: ctx.userId,
          team: payload.team,
        })
      } catch (err) {
        logError('handleEventButton/notifyBlocked', err, { userId: ctx.userId })
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

  // Список обновляется в фоне с дебаунсом — несколько одновременных нажатий
  // превращаются в один messages.edit, что устраняет rate-limit VK.
  scheduleListRefresh({ vk, store, context: ctx, event, userId: ctx.userId })

  const answerOpts = userNoticeText ? { eventData: vkShowSnackbarEventData(userNoticeText) } : {}
  await sendCallbackAnswer(vk, ctx, answerOpts)
  if (userNoticeText) {
    await sendEphemeralPeer(vk, ctx.userId, userNoticeText, 5000)
  }
}
