import { refreshList } from './context.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { ensureRoster } from '../../services/roster.js'
import { findTeamSlotLabel } from '../../parsers/startCommand.js'
import { matchMovePlayerTeamCommand } from '../../parsers/adminChatCommands.js'
import { setPlayerTeamOnFootballSite, isFootballSiteEnabled } from '../../services/footballApi.js'
import { logError } from '../../utils/botLog.js'

function isNoTeamRaw(teamRaw) {
  const t = String(teamRaw ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  return t === 'без' || t === 'безкоманды' || t === 'без команды' || t === 'no' || t === 'none'
}

function pickIdsByTeam(ids, teamSlots, teamMap, wantLabelOrNull) {
  const picked = []
  for (const id of ids) {
    const raw = teamMap instanceof Map ? teamMap.get(id) : null
    const normalized = findTeamSlotLabel(teamSlots, raw)
    if (wantLabelOrNull) {
      if (normalized === wantLabelOrNull) picked.push(id)
    } else {
      if (!normalized) picked.push(id)
    }
  }
  return picked
}

export async function tryMovePlayerTeam({ vk, store, context, event, text }) {
  const m = matchMovePlayerTeamCommand(text)
  if (!m) return false

  ensureRoster(event)

  const teamSlots = Array.isArray(event.teamSlots) ? event.teamSlots : []
  if (!teamSlots.length) {
    await sendEphemeral(vk, context, '⚠️ В этом матче команды не включены.', 4500)
    return true
  }

  const ids = m.where === 'queue' ? (event.queueOrder ?? []) : (event.participantsOrder ?? [])
  const index = Number(m.number)
  if (!Number.isFinite(index) || index <= 0) return true

  const wantFromNoTeam = isNoTeamRaw(m.fromTeamRaw)
  const fromLabel = wantFromNoTeam ? null : findTeamSlotLabel(teamSlots, m.fromTeamRaw)
  if (!wantFromNoTeam && !fromLabel) {
    await sendEphemeral(vk, context, '⚠️ Не нашёл команду (откуда).', 4500)
    return true
  }

  const wantToNoTeam = isNoTeamRaw(m.toTeamRaw)
  const toLabel = wantToNoTeam ? null : findTeamSlotLabel(teamSlots, m.toTeamRaw)
  if (!wantToNoTeam && !toLabel) {
    await sendEphemeral(vk, context, '⚠️ Не нашёл команду (куда).', 4500)
    return true
  }

  const picked = pickIdsByTeam(ids, teamSlots, event.participantTeamByVkId, fromLabel)
  const userId = picked[index - 1] ?? null
  if (userId == null) {
    await sendEphemeral(vk, context, '⚠️ Игрок не найден: проверь команду и номер.', 4500)
    return true
  }

  if (!(event.participantTeamByVkId instanceof Map)) {
    event.participantTeamByVkId = new Map()
  }

  if (toLabel) {
    event.participantTeamByVkId.set(userId, toLabel)
  } else {
    event.participantTeamByVkId.delete(userId)
  }

  if (isFootballSiteEnabled()) {
    setPlayerTeamOnFootballSite({ vkUserId: userId, team: toLabel || null })
      .catch((err) => logError('movePlayerTeam/setPlayerTeamOnFootballSite', err, { userId, toLabel: toLabel || null }))
  }

  await refreshList({ vk, store, context, event })
  return true
}

