import { findTeamSlotLabel } from '../parsers/startCommand.js'
import { ensureRoster } from './roster.js'
import { isVkTournamentTrListEvent } from '../utils/vkTournamentListEvent.js'

/** Сколько максимум держать id в «хвосте», если сайт ещё не успел включить человека в снимок после join. */
const DEFAULT_SITE_SYNC_GRACE_MS = 45_000

/**
 * Пометить vk_id после успешной записи на сайт — poll не сотрёт человека из текста списка из‑за гонки по времени.
 * Подходит и для реальных id ВК, и для синтетических (отрицательных) после +add / создания с сайта.
 * @param {object} event
 * @param {number} vkUserId
 * @param {number} [ttlMs]
 */
export function noteSiteSyncGraceAfterFootballJoin(event, vkUserId, ttlMs = DEFAULT_SITE_SYNC_GRACE_MS) {
  ensureRoster(event)
  if (typeof vkUserId !== 'number' || !Number.isFinite(vkUserId) || vkUserId === 0) return
  const ms = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SITE_SYNC_GRACE_MS
  event.siteSyncGraceUntilByVkId.set(vkUserId, Date.now() + ms)
}

/**
 * Перезаписываем состав ВК из порядка на сайте: первые maxPlayers — основа, остальные — очередь.
 * Игроки без vk_user_id на сайте в снимок не попадают (кроме краткого grace после join, см. выше).
 * @param {object} event — объект события из eventStore (participants, queue, maxPlayers, …)
 * @param {number[]} orderedVkUserIds
 * @param {number[]} [paidVkUserIds] — vk_id с отметкой оплаты с сайта (снимок roster-snapshot)
 * @param {Record<string, string>} [teamLabelByVkUserId] — команды с сайта (ключ — vk_id строкой)
 * @param {string[] | null | undefined} [siteTeamSlots] — слоты кнопок с сайта; если передан массив (в т.ч. []), перезаписываем event.teamSlots
 */
export function applySiteRosterToEvent(
  event,
  orderedVkUserIds,
  paidVkUserIds = [],
  teamLabelByVkUserId = {},
  siteTeamSlots = undefined,
) {
  ensureRoster(event)

  const isTr = isVkTournamentTrListEvent(event)
  if (!isTr) {
    // Обычный матч: не тянем команды с сайта — иначе список в ВК превращается в «турнирный».
    event.teamSlots = null
    event.participantTeamByVkId = new Map()
  } else if (Array.isArray(siteTeamSlots)) {
    event.teamSlots = siteTeamSlots.length > 0 ? [...siteTeamSlots] : null
  }

  const slots = Array.isArray(event.teamSlots) && event.teamSlots.length ? event.teamSlots : null
  const prevTeams =
    slots && event.participantTeamByVkId instanceof Map
      ? new Map(event.participantTeamByVkId)
      : null

  const now = Date.now()
  const grace = event.siteSyncGraceUntilByVkId

  const fromSite = []
  const seen = new Set()
  for (const id of orderedVkUserIds) {
    if (typeof id !== 'number' || !Number.isFinite(id) || id === 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    fromSite.push(id)
    grace?.delete(id)
  }

  const tail = []
  if (grace instanceof Map) {
    for (const [vkId, until] of [...grace.entries()]) {
      if (until <= now) {
        grace.delete(vkId)
        continue
      }
      if (seen.has(vkId)) {
        grace.delete(vkId)
        continue
      }
      seen.add(vkId)
      tail.push(vkId)
    }
  }

  const unique = [...fromSite, ...tail]

  const max = event.maxPlayers
  const main = unique.slice(0, max)
  const queue = unique.slice(max)

  const sitePaid = new Set(
    Array.isArray(paidVkUserIds)
      ? paidVkUserIds.filter((id) => typeof id === 'number' && Number.isFinite(id) && id !== 0)
      : [],
  )
  const nextPaid = new Set()
  for (const id of main) {
    if (sitePaid.has(id)) nextPaid.add(id)
  }
  for (const id of queue) {
    if (sitePaid.has(id)) nextPaid.add(id)
  }

  event.participants = new Set(main)
  event.participantsOrder = [...main]
  event.queue = new Set(queue)
  event.queueOrder = [...queue]
  event.paidParticipants = nextPaid

  if (slots) {
    const siteMap =
      teamLabelByVkUserId && typeof teamLabelByVkUserId === 'object' && !Array.isArray(teamLabelByVkUserId)
        ? teamLabelByVkUserId
        : {}
    const nextMap = new Map()
    for (const id of [...main, ...queue]) {
      const raw = siteMap[id] ?? siteMap[String(id)]
      // Ключ в снимке с сайта: пустая строка = сняли команду, не тянем prev.
      if (raw !== undefined && raw !== null) {
        if (String(raw).trim() === '') {
          continue
        }
        const m = findTeamSlotLabel(slots, String(raw).trim())
        if (m) {
          nextMap.set(id, m)
          continue
        }
      }
      if (prevTeams) {
        const label = prevTeams.get(id)
        if (label) {
          const p = findTeamSlotLabel(slots, label)
          if (p) nextMap.set(id, p)
        }
      }
    }
    event.participantTeamByVkId = nextMap
  } else if (isTr && Array.isArray(siteTeamSlots) && siteTeamSlots.length === 0) {
    event.participantTeamByVkId = new Map()
  }
}
