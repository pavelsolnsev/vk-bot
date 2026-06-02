import { logError } from '../utils/botLog.js'
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

// eventId → { timer, hasNonAdminTrigger }
// hasNonAdminTrigger: хотя бы один не-админ нажал кнопку в текущем окне дебаунса.
// Уведомление о сбое шлём только если есть не-админский триггер.
const pending = new Map()

async function doEdit({ vk, store, context, event }) {
  const text = await buildEventListMessageBody(vk, store.userNameCache, event)
  const keyboard = buildEventKeyboard(event)
  await syncEventListMessage({ vk, context, event, text, keyboard })
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

/**
 * Запланировать обновление VK-сообщения со списком с дебаунсом.
 * userId — кто нажал кнопку; уведомление о сбое не шлётся если кликал только админ.
 *
 * При ошибке edit:
 * — сразу шлём уведомление (если триггер не-админ)
 * — retry через RETRY_DELAY_MS (отменяется новым кликом)
 * — если retry тоже упал — второе уведомление
 */
export function scheduleListRefresh({ vk, store, context, event, userId }) {
  const existing = pending.get(event.id)
  // Если хотя бы один не-админ уже был в окне — сохраняем флаг при перепланировании.
  const prevHasNonAdmin = existing?.hasNonAdminTrigger ?? false
  if (existing) {
    clearTimeout(existing.timer)
  }

  const hasNonAdminTrigger = prevHasNonAdmin || !isAdmin(userId)
  const entry = { timer: null, hasNonAdminTrigger }

  entry.timer = setTimeout(async () => {
    pending.delete(event.id)
    try {
      await doEdit({ vk, store, context, event })
    } catch (err) {
      await notifyFail(vk, event, err, 'listRefreshDebounce', hasNonAdminTrigger)

      if (!pending.has(event.id)) {
        const retryEntry = { timer: null, hasNonAdminTrigger }
        retryEntry.timer = setTimeout(async () => {
          pending.delete(event.id)
          try {
            await doEdit({ vk, store, context, event })
          } catch (retryErr) {
            await notifyFail(vk, event, retryErr, 'listRefreshDebounce/retry', hasNonAdminTrigger)
          }
        }, RETRY_DELAY_MS)
        pending.set(event.id, retryEntry)
      }
    }
  }, DEBOUNCE_MS)

  pending.set(event.id, entry)
}
