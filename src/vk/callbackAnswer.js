import { resolveGroupIdForApi } from './groupId.js'
import { logError } from '../utils/botLog.js'

/** Код VK «Too many requests per second» — флуд-контроль на group-токене. */
const VK_RATE_LIMIT_CODE = 6
/** Сколько раз ретраить ответ при rate-limit, прежде чем сдаться. */
const RATE_LIMIT_RETRIES = 3
/** Базовая микро-пауза между ретраями (растёт линейно: 120 / 240 / 360 мс). */
const RATE_LIMIT_DELAY_MS = 120

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Достаём числовой код ошибки VK из разных форм (vk-io APIError, сырой объект). */
function extractVkErrorCode(err) {
  return err?.code ?? err?.errorCode ?? err?.error_code ?? null
}

/** JSON для event_data: всплывашка только у нажавшего callback-кнопку (VK show_snackbar). */
export function vkShowSnackbarEventData(text) {
  return JSON.stringify({ type: 'show_snackbar', text: String(text ?? '') })
}

/**
 * Ответ на нажатие callback-кнопки (иначе крутится индикатор).
 * Нельзя «пропускать» event_data: для снятия загрузки нужна явная пустая строка
 * event_data="" (см. ответы по sendMessageEventAnswer). Иначе VK может вернуть
 * misleading ошибку вида invalid event_id.
 *
 * Это приоритетный вызов: именно неответ на callback виден игроку как «ошибка» на
 * кнопке, поэтому при rate-limit (код 6) ретраим с микро-паузой, а финальный провал
 * логируем (раньше ошибка глоталась молча и баг было не видно в логах).
 */
export async function sendCallbackAnswer(vk, ctx, { eventData } = {}) {
  const eventId =
    ctx.eventId ?? ctx.payload?.event_id ?? ctx.payload?.eventId ?? ctx.payload?.id
  const peerId = ctx.peerId ?? ctx.payload?.peer_id
  const userId = ctx.userId ?? ctx.payload?.user_id

  if (eventId == null || peerId == null || userId == null) {
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

  // Плоский список вариантов (event_data × group_id) — перебираем по очереди.
  const attempts = []
  for (const ed of eventDataAttempts) {
    for (const extra of groupAttempts) {
      attempts.push({
        event_id: String(eventId),
        peer_id: peerId,
        user_id: userId,
        event_data: ed,
        ...extra,
      })
    }
  }

  let lastError = null
  let rateRetries = 0
  let i = 0
  while (i < attempts.length) {
    try {
      await vk.api.messages.sendMessageEventAnswer(attempts[i])
      return
    } catch (err) {
      lastError = err
      // Флуд-контроль: тот же вариант ещё раз после короткой паузы (не двигаем i).
      if (extractVkErrorCode(err) === VK_RATE_LIMIT_CODE && rateRetries < RATE_LIMIT_RETRIES) {
        rateRetries += 1
        await sleep(RATE_LIMIT_DELAY_MS * rateRetries)
        continue
      }
      // Другой код (напр. протухший event_id) — пробуем следующий вариант event_data / group_id.
      i += 1
    }
  }

  // Все попытки исчерпаны — у игрока кнопка покажет ошибку. Логируем код, чтобы видеть причину.
  logError('callbackAnswer/failed', lastError, {
    code: extractVkErrorCode(lastError),
    peerId,
    userId,
  })
}
