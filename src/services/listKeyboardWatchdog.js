// Сторож кнопок списка. Бывало, что у сообщения со списком в ВК пропадала клавиатура — у всех
// участников сразу, — и возвращалась только после любого обновления списка (например, отметки
// оплаты на сайте). Причину по коду бота не найти: он всегда редактирует список вместе с кнопками.
// Поэтому раз в несколько минут смотрим само сообщение в ВК: нет кнопок — перерисовываем список,
// пропало сообщение — отправляем заново. Каждый такой случай пишем в лог со временем.
import { logError, logEvent } from '../utils/botLog.js'
import { resolveGroupIdForApi } from '../vk/groupId.js'
import { refreshListForEvent } from '../handlers/commands/context.js'

const CHECK_INTERVAL_MS = 3 * 60 * 1000
// Не чаще этого чиним одно и то же событие: если ВК почему-то не отдаёт клавиатуру в ответе
// или не находит сообщение (права), сторож не должен перерисовывать список по кругу.
const REPAIR_COOLDOWN_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 60 * 1000
// ВК может скрыть кнопки и при этом отдавать их в ответе API — тогда проверка выше их «видит».
// Поэтому список, который давно не обновлялся, перерисовываем и без явной пропажи: любое
// обновление (как отметка оплаты на сайте) кнопки возвращает.
const STALE_RENDER_MS = 15 * 60 * 1000

function cooledDown(event, key, ms) {
  const last = Number(event[key])
  return !Number.isFinite(last) || Date.now() - last >= ms
}

let timerId = null
let inFlight = false

/** Есть ли у сообщения из ВК хоть одна кнопка. */
function hasKeyboardButtons(msg) {
  const rows = msg?.keyboard?.buttons
  return Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length > 0)
}

async function checkEvent(vk, store, event) {
  const cmid = Number(event?.listConversationMessageId)
  if (!Number.isFinite(cmid) || cmid <= 0) return

  const params = { peer_id: event.peerId, conversation_message_ids: cmid }
  const groupId = resolveGroupIdForApi(vk)
  if (groupId != null) params.group_id = groupId

  const res = await vk.api.messages.getByConversationMessageId(params)
  const msg = Array.isArray(res?.items) ? res.items[0] : null

  if (!msg) {
    // ВК не вернул сообщение — это может быть и удаление, и нехватка прав. Новый список не шлём
    // (иначе можно наплодить дублей), только пишем в лог — раз в час.
    if (!cooledDown(event, '_watchdogMissingLoggedAt', RESEND_COOLDOWN_MS)) return
    event._watchdogMissingLoggedAt = Date.now()
    logEvent('keyboardWatchdog', 'ВК не вернул сообщение со списком', { peerId: event.peerId, gameEventId: event.id, cmid })
    return
  }

  if (msg.deleted) {
    // ВК прямо говорит: сообщение со списком удалено — без него записаться нельзя. Шлём список заново (с закрепом).
    if (!cooledDown(event, '_watchdogResentAt', RESEND_COOLDOWN_MS)) return
    event._watchdogResentAt = Date.now()
    logEvent('keyboardWatchdog', 'сообщение со списком не найдено в ВК — отправляем заново', {
      peerId: event.peerId,
      gameEventId: event.id,
      cmid,
    })
    event.listConversationMessageId = null
    event.listMessageId = null
    await refreshListForEvent({ vk, store, event })
    return
  }

  if (hasKeyboardButtons(msg)) {
    const last = Number(event.lastListRenderAt)
    if (Number.isFinite(last) && Date.now() - last < STALE_RENDER_MS) return
    await refreshListForEvent({ vk, store, event })
    return
  }
  if (!cooledDown(event, '_watchdogRepairedAt', REPAIR_COOLDOWN_MS)) return
  event._watchdogRepairedAt = Date.now()

  logEvent('keyboardWatchdog', 'у списка пропали кнопки — перерисовываем', {
    peerId: event.peerId,
    gameEventId: event.id,
    cmid,
    textLength: String(msg.text ?? '').length,
    updateTime: msg.update_time ?? null,
  })
  await refreshListForEvent({ vk, store, event })
}

async function runCheck(vk, store) {
  for (const event of [...store.events.values()]) {
    try {
      await checkEvent(vk, store, event)
    } catch (err) {
      logError('keyboardWatchdog', err, { peerId: event?.peerId, gameEventId: event?.id })
    }
  }
}

/** Запустить сторожа (один на процесс). */
export function startListKeyboardWatchdog(vk, store) {
  if (timerId != null) return
  timerId = setInterval(() => {
    if (inFlight) return
    inFlight = true
    runCheck(vk, store).finally(() => {
      inFlight = false
    })
  }, CHECK_INTERVAL_MS)
}
