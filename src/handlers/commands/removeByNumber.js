import { getUserIdByIndex } from './indexByNumber.js'
import { refreshList } from './context.js'
import { leaveEvent } from '../../services/roster.js'
import { notifyPromotedToMain } from '../../services/dmNotifications.js'

export async function tryRemoveByNumber({ vk, store, context, event, text }) {
  const m = text.match(/^r(\d+)$/iu)
  if (!m) return false

  const userId = getUserIdByIndex(event, m[1])
  if (userId == null) return true

  // Удаляем как "Выйти": если игрок был в основном составе — подтянем первого из очереди.
  const res = leaveEvent(event, userId)
  if (res?.promoted?.length) {
    await notifyPromotedToMain(vk, res.promoted)
  }

  await refreshList({ vk, store, context, event })
  return true
}

