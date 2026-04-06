import { getUserIdByIndex } from './indexByNumber.js'
import { refreshList } from './context.js'
import { leaveEvent } from '../../services/roster.js'
import { notifyPromotedToMain } from '../../services/dmNotifications.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'

export async function tryRemoveByNumber({ vk, store, context, event, text }) {
  const m = text.match(/^r(\d+)$/iu)
  if (!m) return false

  const userId = getUserIdByIndex(event, m[1])
  if (userId == null) return true

  const inRoster = event.participants.has(userId) || event.queue.has(userId)
  if (!inRoster) {
    await refreshList({ vk, store, context, event })
    return true
  }

  // Сначала сайт — при live не снимаем человека из списка ВК.
  const apiRes = await removePlayerFromFootballSite({ vkUserId: userId })
  if (apiRes?.tournamentLive) {
    await sendEphemeral(context, '⚠️ Идёт live-матч, снять с турнира на сайте нельзя.', 5000)
    await refreshList({ vk, store, context, event })
    return true
  }

  // Строку в players удаляет только админ на сайте или вручную в БД — здесь только состав турнира.
  const res = leaveEvent(event, userId)
  if (res?.promoted?.length) {
    await notifyPromotedToMain(vk, res.promoted)
  }

  await refreshList({ vk, store, context, event })
  return true
}
