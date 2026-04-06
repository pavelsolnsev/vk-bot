import { logError } from '../utils/botLog.js'
import { fetchFootballSiteRosterSnapshot, ackVkListCloseRequest, unregisterVkListLinkOnFootballSite } from './footballApi.js'
import { applySiteRosterToEvent } from './applySiteRosterToEvent.js'
import { refreshListForEvent } from '../handlers/commands/context.js'
import { runCloseEvent } from '../handlers/commands/closeEvent.js'

const DEFAULT_INTERVAL_MS = 22_000

/**
 * Поллинг сайта: синк состава + закрытие списка в ВК по флагу (как e!).
 * @param {import('vk-io').VK} vk
 * @param {ReturnType<import('../store/eventStore.js').createEventStore>} store
 * @param {number} [intervalMs]
 */
export function startSiteRosterPoll(vk, store, intervalMs = DEFAULT_INTERVAL_MS) {
  setInterval(() => {
    runSiteRosterPollTick(vk, store).catch((err) => logError('siteRosterPoll/tick', err))
  }, intervalMs)
}

async function runSiteRosterPollTick(vk, store) {
  const snap = await fetchFootballSiteRosterSnapshot()
  if (!snap) return

  if (snap.closeVkListRequested === true) {
    if (snap.linked === true && typeof snap.peerId === 'number') {
      const closed = await runCloseEvent({ vk, store, peerId: snap.peerId })
      if (!closed) {
        await unregisterVkListLinkOnFootballSite().catch((err) =>
          logError('siteRosterPoll/unregister', err),
        )
      }
    } else {
      await unregisterVkListLinkOnFootballSite().catch((err) =>
        logError('siteRosterPoll/unregisterNoLink', err),
      )
    }
    await ackVkListCloseRequest().catch((err) => logError('siteRosterPoll/ackClose', err))
  }

  if (snap.linked !== true) return

  const { peerId, gameEventId, rosterVkUserIds } = snap
  if (typeof peerId !== 'number' || typeof gameEventId !== 'string') return

  const roster = Array.isArray(rosterVkUserIds) ? rosterVkUserIds : []
  const ev = store.getEvent(gameEventId)
  if (!ev || ev.peerId !== peerId) return

  const sig = roster.join(',')
  if (ev.lastSiteRosterSig === sig) return

  ev.lastSiteRosterSig = sig
  applySiteRosterToEvent(ev, roster)
  await refreshListForEvent({ vk, store, event: ev })
}
