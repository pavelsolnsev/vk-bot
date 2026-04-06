import { joinEvent, leaveEvent } from '../../services/roster.js'
import { refreshList } from './context.js'
import { notifyJoinedQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'
import { syncFootballAfterJoin } from '../../services/footballRosterSync.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'

export async function tryPlusMinus({ vk, store, context, event, text, senderId }) {
  if (text !== '+' && text !== '-') return false

  // Плюс и минус в чате — как кнопки, но без snackbar (только ephemeral при блоке live).
  if (text === '+') {
    const res = joinEvent(event, senderId)
    const rolledBack = await syncFootballAfterJoin(vk, senderId, res, {
      event,
      onBlocked: () =>
        sendEphemeral(context, '⚠️ Идёт live-матч, запись в турнир на сайте закрыта.', 5000),
    })
    if (res?.status === 'noop') {
      const msg = event.participants.has(senderId)
        ? 'Вы уже в основном составе.'
        : 'Вы уже в очереди.'
      await sendEphemeral(context, msg, 5000)
    } else if (res?.status === 'queue' && !rolledBack) {
      await notifyJoinedQueue(vk, senderId)
    }
  }
  if (text === '-') {
    const inRoster = event.participants.has(senderId) || event.queue.has(senderId)
    if (!inRoster) {
      await sendEphemeral(context, 'Вас нет в списке записи.', 5000)
    } else {
      const apiRes = await removePlayerFromFootballSite({ vkUserId: senderId })
      if (apiRes?.tournamentLive) {
        await sendEphemeral(context, '⚠️ Идёт live-матч, выход из турнира на сайте закрыт.', 5000)
      } else {
        const res = leaveEvent(event, senderId)
        if (res?.promoted?.length) {
          await notifyPromotedToMain(vk, res.promoted)
        }
      }
    }
  }

  await refreshList({ vk, store, context, event })
  return true
}
