import { setTeamLimit } from '../../services/roster.js'
import { refreshList } from './context.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { notifyMovedToQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'
import { setVkTeamLimitOnFootballSite, isFootballSiteEnabled } from '../../services/footballApi.js'
import { logError } from '../../utils/botLog.js'
import { isVkTournamentTrListEvent } from '../../utils/vkTournamentListEvent.js'

/**
 * Лимит конкретной команды: `tl<N> <лимит>`, где N — номер команды из списка (▸ N) …).
 * Пример: `tl1 8` — у команды №1 лимит 8. Номер однозначен (в отличие от имени с цифрами).
 */
export async function trySetTeamLimit({ vk, store, context, event, text }) {
  const m = text.match(/^tl(\d+)\s+(\d+)$/iu)
  if (!m) return false

  if (!isVkTournamentTrListEvent(event)) {
    await sendEphemeral(vk, context, 'ℹ️ Лимит команды (tl) только для турнира: s tr.', 4500)
    return true
  }

  const slots = Array.isArray(event.teamSlots) ? event.teamSlots : []
  const idx = Number(m[1])
  const slot = slots[idx - 1]
  if (!slot) {
    await sendEphemeral(vk, context, '⚠️ Нет команды с таким номером — смотри номера в списке.', 4500)
    return true
  }

  const res = setTeamLimit(event, slot, Number(m[2]))
  if (!res.ok) {
    await sendEphemeral(vk, context, '⚠️ Лимит должен быть числом ≥ 1.', 4000)
    return true
  }

  if (Array.isArray(res.movedToQueue) && res.movedToQueue.length) {
    await notifyMovedToQueue(vk, res.movedToQueue)
  }
  if (Array.isArray(res.promoted) && res.promoted.length) {
    await notifyPromotedToMain(vk, res.promoted)
  }

  // Пишем лимит на сайт — иначе следующий поллинг состава вернёт прежнее значение.
  if (isFootballSiteEnabled()) {
    setVkTeamLimitOnFootballSite({ team: res.canon, limit: res.limit })
      .catch((err) => logError('teamLimit/setVkTeamLimitOnFootballSite', err, { team: res.canon, limit: res.limit }))
  }

  await refreshList({ vk, store, context, event })
  return true
}
