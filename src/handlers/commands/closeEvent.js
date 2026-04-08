import { logError } from '../../utils/botLog.js'
import { deleteListMessage } from '../../vk/listMessage.js'
import { deleteLiveNoticeMessage } from '../../vk/tournamentLiveNotice.js'
import { unregisterVkListLinkOnFootballSite } from '../../services/footballApi.js'

let stopSiteListPoll = () => {}

/** Вызывается из index.js: остановка поллинга сайта после закрытия списка. */
export function setSiteListPollStop(fn) {
  stopSiteListPoll = typeof fn === 'function' ? fn : () => {}
}

export async function runCloseEvent({ vk, store, peerId }) {
  const lastId = store.getLastEventId(peerId)
  if (!lastId) return false

  const event = store.getEvent(lastId)
  if (event) {
    try {
      await deleteListMessage(vk, { peerId, event })
    } catch {
      // закрываем состояние даже если удалить сообщение не удалось
    }
    try {
      await deleteLiveNoticeMessage(vk, { peerId, event })
    } catch {
      /* то же: не блокируем закрытие списка */
    }
  }

  store.deleteEvent(lastId)
  // Кэш имён ВК для следующего списка с нуля (не тянем подписи прошлой сессии).
  try {
    store.userNameCache?.clear?.()
  } catch {
    /* ignore */
  }
  // Сайт больше не должен пушить состав в этот чат (список закрыт); на сайте очищается selectedIds.
  await unregisterVkListLinkOnFootballSite().catch((err) => logError('closeEvent/unregister', err))
  stopSiteListPoll()
  return true
}

