import { findTeamSlotLabel } from '../../parsers/startCommand.js'

export function getUserIdByIndex(event, index1based) {
  const index = Number(index1based)
  if (!Number.isFinite(index) || index <= 0) return null
  const ids = Array.isArray(event.participantsOrder)
    ? event.participantsOrder
    : [...(event.participants || [])]
  return ids[index - 1] ?? null
}

function normalizeTeamKey(raw) {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.toLowerCase()
}

function resolveSlotLabel(event, teamRaw) {
  const slots = Array.isArray(event?.teamSlots) ? event.teamSlots : []
  return findTeamSlotLabel(slots, teamRaw)
}

function isNoTeamKeyword(teamRaw) {
  const t = normalizeTeamKey(teamRaw)
  if (!t) return false
  return t === 'без' || t === 'безкоманды' || t === 'без команды' || t === 'no' || t === 'none'
}

/**
 * В режиме команд возвращаем игрока по номеру ВНУТРИ команды (1..N).
 * Используем только основной список (participantsOrder), как и p/r раньше.
 */
export function getUserIdByTeamIndex(event, teamRaw, index1based) {
  const index = Number(index1based)
  if (!Number.isFinite(index) || index <= 0) return null

  const ids = Array.isArray(event.participantsOrder)
    ? event.participantsOrder
    : [...(event.participants || [])]

  const map = event?.participantTeamByVkId
  const slots = Array.isArray(event?.teamSlots) ? event.teamSlots : []
  const wantNoTeam = isNoTeamKeyword(teamRaw)
  const slotLabel = wantNoTeam ? null : resolveSlotLabel(event, teamRaw)

  if (!wantNoTeam && !slotLabel) return null

  const picked = []
  for (const id of ids) {
    const label = map instanceof Map ? map.get(id) : null
    if (slotLabel) {
      // Сверяем через нормализацию, чтобы пережить старые/ручные значения в другом регистре.
      if (findTeamSlotLabel(slots, label) === slotLabel) picked.push(id)
    } else {
      // «Без команды»: те, кто без метки, с пустой меткой или с меткой, которой нет в списке слотов.
      const resolved = findTeamSlotLabel(slots, label)
      if (!resolved) picked.push(id)
    }
  }

  return picked[index - 1] ?? null
}

