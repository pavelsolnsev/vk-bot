import { logError, logEvent } from '../../utils/botLog.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { refreshList } from './context.js'

/**
 * open! — снова открыть запись в списке. Нужна, если матч на сайте запустили случайно:
 * после первого live-матча бот закрывает запись (остаётся только кнопка оплаты).
 * Пока на сайте идёт тот же матч, сверка с сайтом запись обратно не закроет (registrationReopenHold).
 */
export async function runReopenRegistration({ vk, store, context, event }) {
  if (event.registrationClosed !== true) {
    await sendEphemeral(vk, context, 'ℹ️ Запись и так открыта', 3000)
    return
  }
  event.registrationClosed = false
  event.registrationReopenHold = true
  logEvent('reopenRegistration', 'админ снова открыл запись', { peerId: event.peerId, gameEventId: event.id })
  try {
    await refreshList({ vk, store, context, event })
  } catch (err) {
    logError('reopenRegistration/refresh', err, { peerId: event.peerId })
  }
  await sendEphemeral(vk, context, '✅ Запись снова открыта', 3000)
}
