// После join в списке ВК — синхронизируем с football-сайтом (как кнопка «Играть» / «+»).
// Выход с сайта делаем в обработчиках ДО leaveEvent в ВК (см. handleEventButton, plusMinus).
import { logError } from '../utils/botLog.js'
import { leaveEvent } from './roster.js'
import { noteSiteSyncGraceAfterFootballJoin } from './applySiteRosterToEvent.js'
import { registerPlayerOnFootballSite } from './footballApi.js'

/**
 * Игрок реально попал в основу или очередь — регистрируем на сайте.
 * Если сайт ответил «live» — откатываем join в ВК и вызываем onBlocked.
 *
 * @param {import('vk-io').VK} vk
 * @param {number} userId
 * @param {{ status?: string } | null | undefined} joinRes
 * @param {{ event?: object | undefined, onBlocked?: () => void | Promise<void>, overrideFirstName?: string, overrideLastName?: string, team?: string }} [options]
 * @returns {Promise<boolean>} true если запись на сайт заблокирована и join в ВК откатили
 */
export async function syncFootballAfterJoin(vk, userId, joinRes, options = {}) {
  const { event, onBlocked, overrideFirstName, overrideLastName, team } = options
  if (joinRes?.status !== 'main' && joinRes?.status !== 'queue') return false
  try {
    let firstName = typeof overrideFirstName === 'string' ? overrideFirstName.trim() : ''
    let lastName = typeof overrideLastName === 'string' ? overrideLastName.trim() : ''
    // Реальные id ВК — тянем имя из API; синтетические (отрицательные) — только из override (+add / сайт).
    if (!firstName && userId > 0) {
      const users = await vk.api.users.get({ user_ids: [userId] })
      const user = users?.[0]
      if (!user) return false
      firstName = user.first_name ?? ''
      lastName = user.last_name ?? ''
    }
    if (!firstName) return false

    // Сразу до POST /api/vk/join: иначе poll сайт→ВК применяет снимок без игрока и снимает его с ВК до ответа join.
    if (event) {
      event.footballSiteJoinSeq = (Number(event.footballSiteJoinSeq) || 0) + 1
      noteSiteSyncGraceAfterFootballJoin(event, userId)
    }

    const result = await registerPlayerOnFootballSite({
      vkUserId: userId,
      firstName,
      lastName,
      team: typeof team === 'string' && team.trim() ? team.trim() : undefined,
      joinRequestId: event?.footballSiteJoinSeq,
    })
    // Сайт в live — убираем из списка ВК и даём сигнал показать snackbar / ephemeral.
    if (result?.tournamentLive && event) {
      leaveEvent(event, userId)
      if (typeof onBlocked === 'function') await onBlocked()
      return true
    }
  } catch (err) {
    logError('syncFootballAfterJoin', err, { userId })
  }
  return false
}
