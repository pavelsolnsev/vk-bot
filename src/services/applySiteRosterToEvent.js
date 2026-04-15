import { ensureRoster } from './roster.js'

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
 */
export function applySiteRosterToEvent(event, orderedVkUserIds) {
  ensureRoster(event)

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

  const nextPaid = new Set()
  for (const id of main) {
    if (event.paidParticipants.has(id)) nextPaid.add(id)
  }
  for (const id of queue) {
    if (event.paidParticipants.has(id)) nextPaid.add(id)
  }

  event.participants = new Set(main)
  event.participantsOrder = [...main]
  event.queue = new Set(queue)
  event.queueOrder = [...queue]
  event.paidParticipants = nextPaid

  // Сайт не знает про «команды в ВК» — если человек остался в списке, оставляем ему ту же метку для текста.
  if (prevTeams && slots) {
    const nextMap = new Map()
    for (const id of [...main, ...queue]) {
      const label = prevTeams.get(id)
      if (label && slots.includes(label)) nextMap.set(id, label)
    }
    event.participantTeamByVkId = nextMap
  }
}
