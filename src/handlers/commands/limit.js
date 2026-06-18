import { setLimit } from '../../services/roster.js'
import { refreshList } from './context.js'
import { notifyMovedToQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'
import { setVkListLimitOnFootballSite, isFootballSiteEnabled } from '../../services/footballApi.js'
import { logError } from '../../utils/botLog.js'

export async function trySetLimit({ vk, store, context, event, text }) {
  const m = text.match(/^l(\d+)$/iu)
  if (!m) return false

  const limit = Number(m[1])
  const { movedToQueue, promoted } = setLimit(event, limit) || {}
  if (Array.isArray(movedToQueue) && movedToQueue.length) {
    await notifyMovedToQueue(vk, movedToQueue)
  }
  if (Array.isArray(promoted) && promoted.length) {
    await notifyPromotedToMain(vk, promoted)
  }
  // Пишем общий лимит на сайт — иначе следующий поллинг вернёт прежнее значение.
  if (isFootballSiteEnabled()) {
    setVkListLimitOnFootballSite({ limit })
      .catch((err) => logError('limit/setVkListLimitOnFootballSite', err, { limit }))
  }
  await refreshList({ vk, store, context, event })
  return true
}

