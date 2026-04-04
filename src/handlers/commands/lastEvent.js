export function getLastEventOrNull({ store, peerId }) {
  const lastId = store.getLastEventId(peerId)
  if (!lastId) return null
  return store.getEvent(lastId) || null
}

