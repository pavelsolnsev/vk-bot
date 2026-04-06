import { ensureRoster } from './roster.js'

/**
 * Перезаписываем состав ВК из порядка на сайте: первые maxPlayers — основа, остальные — очередь.
 * Игроков без vk_user_id на сайте сюда не передаём.
 * @param {object} event — объект события из eventStore (participants, queue, maxPlayers, …)
 * @param {number[]} orderedVkUserIds
 */
export function applySiteRosterToEvent(event, orderedVkUserIds) {
  ensureRoster(event)

  const unique = []
  const seen = new Set()
  for (const id of orderedVkUserIds) {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(id)
  }

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
}
