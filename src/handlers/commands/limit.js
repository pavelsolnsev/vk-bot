import { setLimit } from '../../services/roster.js'
import { refreshList } from './context.js'
import { notifyMovedToQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'

export async function trySetLimit({ vk, store, context, event, text }) {
  const m = text.match(/^l(\d+)$/iu)
  if (!m) return false

  const { movedToQueue, promoted } = setLimit(event, Number(m[1])) || {}
  if (Array.isArray(movedToQueue) && movedToQueue.length) {
    await notifyMovedToQueue(vk, movedToQueue)
  }
  if (Array.isArray(promoted) && promoted.length) {
    await notifyPromotedToMain(vk, promoted)
  }
  await refreshList({ vk, store, context, event })
  return true
}

