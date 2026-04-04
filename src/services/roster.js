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
}

export function joinEvent(event, userId) {
  ensureRoster(event)

  if (event.participants.has(userId) || event.queue.has(userId)) return { status: 'noop' }

  if (event.participants.size < event.maxPlayers) {
    event.participants.add(userId)
    event.participantsOrder.push(userId)
    return { status: 'main' }
  } else {
    event.queue.add(userId)
    event.queueOrder.push(userId)
    return { status: 'queue' }
  }
}

export function leaveEvent(event, userId) {
  ensureRoster(event)

  if (event.participants.delete(userId)) {
    removeFromOrder(event.participantsOrder, userId)
    event.paidParticipants.delete(userId)
    const promoted = promoteFromQueue(event)
    return { leftFrom: 'main', promoted }
  }

  if (event.queue.delete(userId)) {
    removeFromOrder(event.queueOrder, userId)
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
  event.participants.delete(userId)
  event.queue.delete(userId)
  event.paidParticipants.delete(userId)
  removeFromOrder(event.participantsOrder, userId)
  removeFromOrder(event.queueOrder, userId)
}

function removeFromOrder(order, userId) {
  const idx = order.indexOf(userId)
  if (idx !== -1) order.splice(idx, 1)
}

