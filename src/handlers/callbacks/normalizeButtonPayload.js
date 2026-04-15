function normalizeEventPayload(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw
  return null
}

/** VK часто возвращает payload с snake_case: event_id вместо eventId */
export function normalizeButtonPayload(raw) {
  const p = normalizeEventPayload(raw)
  if (!p || typeof p !== 'object') return null
  const cmd = p.cmd ?? p.command
  const gameEventId = p.event_id ?? p.eventId ?? p.eid
  if (!cmd || !gameEventId) return null
  const teamRaw = p.team ?? p.t
  const team = typeof teamRaw === 'string' && teamRaw.trim() !== '' ? teamRaw.trim() : undefined
  return { cmd, gameEventId, team }
}

