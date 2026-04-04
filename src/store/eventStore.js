export function createEventStore() {
  const events = new Map()
  const lastEventByPeer = new Map()
  const userNameCache = new Map()

  return {
    events,
    lastEventByPeer,
    userNameCache,

    createEvent({ peerId, senderId, date, time, place }) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const placeKey = String(place || '').trim().toLowerCase()
      const defaultLimit = placeKey === 'saturn' ? 10 : 20
      const event = {
        id,
        peerId,
        createdBy: senderId,
        date,
        time,
        place,
        participants: new Set(),
        participantsOrder: [],
        queue: new Set(),
        queueOrder: [],
        /** кто оплатил (галочка ✅) */
        paidParticipants: new Set(),
        maxPlayers: defaultLimit,
        createdAt: Date.now(),
        notificationSent: false,
        /** conversation_message_id — для messages.edit */
        listConversationMessageId: null,
        /** обычный message_id — запасной идентификатор для messages.edit */
        listMessageId: null,
      }
      events.set(id, event)
      lastEventByPeer.set(peerId, id)
      return event
    },

    getEvent(id) {
      return events.get(id)
    },

    getLastEventId(peerId) {
      return lastEventByPeer.get(peerId)
    },

    deleteEvent(id) {
      const event = events.get(id)
      if (!event) return false
      events.delete(id)
      const lastId = lastEventByPeer.get(event.peerId)
      if (lastId === id) lastEventByPeer.delete(event.peerId)
      return true
    },

    clearPeer(peerId) {
      const lastId = lastEventByPeer.get(peerId)
      if (!lastId) return null
      lastEventByPeer.delete(peerId)
      const event = events.get(lastId) || null
      if (event) events.delete(lastId)
      return event
    },
  }
}
