import { logError, logWarn } from '../utils/botLog.js'
import { buildEventKeyboard } from '../vk/keyboard.js'
import { syncEventListMessage } from '../vk/listMessage.js'
import { buildEventListMessageBody } from './eventListText.js'
import { notifyAdminsListUpdateFailed } from './dmNotifications.js'
import { isAdmin } from '../auth/admin.js'

// Несколько игроков могут нажать кнопку почти одновременно — без дебаунса каждый вызов
// шлёт messages.edit, VK режет rate-limit и часть обновлений теряется.
// Все вызовы в течение DEBOUNCE_MS объединяются в один edit с актуальным состоянием.
const DEBOUNCE_MS = 800

// Если edit упал (rate-limit, флуктуация VK) — делаем один retry через RETRY_DELAY_MS.
// Retry хранится в том же pending и автоматически отменяется новым кликом кнопки.
const RETRY_DELAY_MS = 5_000

const pending = new Map()

async function doEdit({ vk, store, context, event }) {
  const startedAt = Date.now()
  const text = await buildEventListMessageBody(vk, store.userNameCache, event)
  const keyboard = buildEventKeyboard(event)
  const builtAt = Date.now()
  await syncEventListMessage({ vk, context, event, text, keyboard })
  const editMs = Date.now() - builtAt
  if (Date.now() - startedAt >= 2000) {
    logWarn('listRefresh/slow', 'Долгое обновление списка', { peerId: event.peerId, buildMs: builtAt - startedAt, editMs })
  }
}

async function notifyFail(vk, event, err, label, shouldNotify) {
  logError(label, err, { eventId: event.id, peerId: event.peerId })
  if (!shouldNotify) return
  try {
    await notifyAdminsListUpdateFailed(vk, {
      peerId: event.peerId,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
  } catch (notifyErr) {
    logError('listRefreshDebounce/notify', notifyErr, { eventId: event.id })
  }
}

function startTimer(entry, delay, retry = false) {
  entry.retry = retry
  entry.timer = setTimeout(async () => {
    entry.timer = null
    const request = entry.request
    const { vk, event } = request
    const shouldNotify = entry.hasNonAdminTrigger
    entry.request = null
    entry.hasNonAdminTrigger = false
    try {
      await doEdit(request)
    } catch (err) {
      const label = retry ? 'listRefreshDebounce/retry' : 'listRefreshDebounce'
      void notifyFail(vk, event, err, label, shouldNotify)
      if (!retry && !entry.request) {
        entry.request = request
        entry.hasNonAdminTrigger = shouldNotify
        startTimer(entry, RETRY_DELAY_MS, true)
        return
      }
    }
    if (entry.request) startTimer(entry, DEBOUNCE_MS)
    else pending.delete(event.id)
  }, delay)
}

export function scheduleListRefresh(request) {
  const eventId = request.event.id
  let entry = pending.get(eventId)
  if (!entry) {
    entry = { request, hasNonAdminTrigger: !isAdmin(request.userId) }
    pending.set(eventId, entry)
    startTimer(entry, DEBOUNCE_MS)
    return
  }
  entry.request = request
  entry.hasNonAdminTrigger ||= !isAdmin(request.userId)
  if (entry.retry && entry.timer) {
    clearTimeout(entry.timer)
    startTimer(entry, DEBOUNCE_MS)
  }
}
