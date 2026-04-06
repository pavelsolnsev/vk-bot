import { fetchFootballSiteRosterSnapshot } from './footballApi.js'
import { applySiteRosterToEvent } from './applySiteRosterToEvent.js'
import { refreshListForEvent } from '../handlers/commands/context.js'

const DEFAULT_INTERVAL_MS = 22_000

/**
 * Периодически тянем состав с сайта и обновляем список в чате, если событие создано ботом (есть link на сайте).
 * @param {import('vk-io').VK} vk
 * @param {ReturnType<import('../store/eventStore.js').createEventStore>} store
 * @param {number} [intervalMs]
 */
export function startSiteRosterPoll(vk, store, intervalMs = DEFAULT_INTERVAL_MS) {
  setInterval(() => {
    runSiteRosterPollTick(vk, store).catch(() => {})
  }, intervalMs)
}

async function runSiteRosterPollTick(vk, store) {
  const snap = await fetchFootballSiteRosterSnapshot()
  if (!snap || snap.linked !== true) return

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
