import { logError } from '../utils/botLog.js'
import { buildEventKeyboard } from '../vk/keyboard.js'
import { syncEventListMessage } from '../vk/listMessage.js'
import { buildEventListMessageBody } from './eventListText.js'
import { notifyAdminsListUpdateFailed } from './dmNotifications.js'

// Несколько игроков могут нажать кнопку почти одновременно — без дебаунса каждый вызов
// шлёт messages.edit, VK режет rate-limit и часть обновлений теряется.
// Все вызовы в течение DEBOUNCE_MS объединяются в один edit с актуальным состоянием.
const DEBOUNCE_MS = 800

// Не спамим админу: одно уведомление об ошибке не чаще раза в 5 минут на событие.
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000
const lastFailNotifyAt = new Map() // eventId → timestamp

const pending = new Map() // eventId → timer

/**
 * Запланировать обновление VK-сообщения со списком с дебаунсом.
 * Возвращает управление сразу — edit происходит в фоне через DEBOUNCE_MS.
 */
export function scheduleListRefresh({ vk, store, context, event }) {
  const existing = pending.get(event.id)
  if (existing) {
    clearTimeout(existing)
  }

  const timer = setTimeout(async () => {
    pending.delete(event.id)
    try {
      const text = await buildEventListMessageBody(vk, store.userNameCache, event)
      const keyboard = buildEventKeyboard(event)
      await syncEventListMessage({ vk, context, event, text, keyboard })
    } catch (err) {
      logError('listRefreshDebounce', err, { eventId: event.id, peerId: event.peerId })

      // Уведомляем админа, но не чаще раза в NOTIFY_COOLDOWN_MS на событие.
      const now = Date.now()
      const lastAt = lastFailNotifyAt.get(event.id) ?? 0
      if (now - lastAt >= NOTIFY_COOLDOWN_MS) {
        lastFailNotifyAt.set(event.id, now)
        try {
          await notifyAdminsListUpdateFailed(vk, {
            peerId: event.peerId,
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        } catch (notifyErr) {
          logError('listRefreshDebounce/notify', notifyErr, { eventId: event.id })
        }
      }
    }
  }, DEBOUNCE_MS)

  pending.set(event.id, timer)
}
