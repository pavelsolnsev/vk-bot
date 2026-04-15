import { findTeamSlotLabel } from '../parsers/startCommand.js'

/**
 * Логика списка + очереди в стиле telegram-bot:
 * - если мест нет, игрок уходит в очередь
 * - при освобождении места игрок из очереди переходит в основной список
 */
export function ensureRoster(event) {
  if (!event.queue) event.queue = new Set()
  if (!event.queueOrder) event.queueOrder = []
  if (!event.paidParticipants) event.paidParticipants = new Set()
  if (!Number.isFinite(event.maxPlayers) || event.maxPlayers <= 0) event.maxPlayers = 20
  if (!event.participants) event.participants = new Set()
  if (!event.participantsOrder) event.participantsOrder = []
  // Карта «кто в какой команде» только для отображения в ВК; без неё старые события ведут себя как раньше.
  if (!event.participantTeamByVkId) event.participantTeamByVkId = new Map()
  // Временная «страховка» после POST /api/vk/join: снимок состава мог прийти из БД на мгновение раньше фиксации.
  if (!event.siteSyncGraceUntilByVkId) event.siteSyncGraceUntilByVkId = new Map()
}

function clearSiteSyncGraceForVkId(event, userId) {
  event.siteSyncGraceUntilByVkId?.delete(userId)
}

/** Если в матче заданы команды, запоминаем выбор с кнопки (или не трогаем карту при записи через +). */
function noteTeamChoiceAfterJoin(event, userId, teamFromButton) {
  const slots = event.teamSlots
  if (!Array.isArray(slots) || !slots.length) return
  ensureRoster(event)
  // Сопоставляем мягко (регистр/пробелы), но сохраняем каноничное имя слота.
  const matched = findTeamSlotLabel(slots, teamFromButton)
  if (!matched) return
  event.participantTeamByVkId.set(userId, matched)
}

export function joinEvent(event, userId, joinOptions = {}) {
  ensureRoster(event)

  if (event.participants.has(userId) || event.queue.has(userId)) return { status: 'noop' }

  if (event.participants.size < event.maxPlayers) {
    event.participants.add(userId)
    event.participantsOrder.push(userId)
    noteTeamChoiceAfterJoin(event, userId, joinOptions.team)
    return { status: 'main' }
  } else {
    event.queue.add(userId)
    event.queueOrder.push(userId)
    noteTeamChoiceAfterJoin(event, userId, joinOptions.team)
    return { status: 'queue' }
  }
}

export function leaveEvent(event, userId) {
  ensureRoster(event)
  clearSiteSyncGraceForVkId(event, userId)

  if (event.participants.delete(userId)) {
    removeFromOrder(event.participantsOrder, userId)
    event.paidParticipants.delete(userId)
    event.participantTeamByVkId?.delete(userId)
    const promoted = promoteFromQueue(event)
    return { leftFrom: 'main', promoted }
  }

  if (event.queue.delete(userId)) {
    removeFromOrder(event.queueOrder, userId)
    event.participantTeamByVkId?.delete(userId)
    return { leftFrom: 'queue', promoted: [] }
  }
  return { leftFrom: 'none', promoted: [] }
}

export function setLimit(event, newLimit) {
  ensureRoster(event)

  const limit = Number(newLimit)
  if (!Number.isFinite(limit) || limit <= 0) return { movedToQueue: [], promoted: [] }

  if (limit === event.maxPlayers) return { movedToQueue: [], promoted: [] }

  let movedToQueue = []

  // telegram-bot: если лимит уменьшаем — лишние уходят в НАЧАЛО очереди
  if (limit < event.maxPlayers) {
    const keep = event.participantsOrder.slice(0, limit)
    const overflow = event.participantsOrder.slice(limit)

    overflow.forEach((id) => {
      event.participants.delete(id)
      event.paidParticipants.delete(id)
    })

    event.participantsOrder = keep

    // overflow идёт в НАЧАЛО очереди
    const existingQueue = event.queueOrder.filter((id) => !overflow.includes(id))
    event.queueOrder = [...overflow, ...existingQueue]
    overflow.forEach((id) => event.queue.add(id))

    movedToQueue = overflow
  }

  event.maxPlayers = limit

  // если лимит увеличили — добираем из очереди
  const promoted = promoteFromQueue(event)
  return { movedToQueue, promoted }
}

function promoteFromQueue(event) {
  ensureRoster(event)

  const promoted = []
  while (event.participants.size < event.maxPlayers && event.queueOrder.length > 0) {
    const next = event.queueOrder.shift()
    if (next == null) break
    event.queue.delete(next)
    event.participants.add(next)
    event.participantsOrder.push(next)
    promoted.push(next)
  }
  return promoted
}

export function removeUserEverywhere(event, userId) {
  ensureRoster(event)
  clearSiteSyncGraceForVkId(event, userId)
  event.participants.delete(userId)
  event.queue.delete(userId)
  event.paidParticipants.delete(userId)
  event.participantTeamByVkId?.delete(userId)
  removeFromOrder(event.participantsOrder, userId)
  removeFromOrder(event.queueOrder, userId)
}

function removeFromOrder(order, userId) {
  const idx = order.indexOf(userId)
  if (idx !== -1) order.splice(idx, 1)
}

