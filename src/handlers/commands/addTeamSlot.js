import { refreshList } from './context.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { ensureRoster } from '../../services/roster.js'
import { findTeamSlotLabel } from '../../parsers/startCommand.js'
import { matchTeamSlotCommand } from '../../parsers/adminChatCommands.js'
import { isFootballSiteEnabled, registerVkListLinkOnFootballSite } from '../../services/footballApi.js'

function ensureTeamSlots(event) {
  ensureRoster(event)
  if (!Array.isArray(event.teamSlots)) event.teamSlots = []
  if (!(event.participantTeamByVkId instanceof Map)) event.participantTeamByVkId = new Map()
  return event.teamSlots
}

export async function tryAddTeamSlots({ vk, store, context, event, text }) {
  const m = matchTeamSlotCommand(text)
  if (!m) return false

  const teamNames = m.teamNames
  if (!teamNames?.length) return true

  const slots = ensureTeamSlots(event)

  const before = slots.length
  let skippedByLimit = false
  for (const t of teamNames) {
    // Не добавляем дубль даже если у админа другой регистр/пробелы.
    if (findTeamSlotLabel(slots, t)) continue
    // См. лимит строк ВК: команды столбиком + ряд «Выйти» — не больше 9 слотов команд.
    if (slots.length >= 9) {
      skippedByLimit = true
      break
    }
    slots.push(t)
  }

  if (slots.length === before) {
    const msg = skippedByLimit
      ? 'ℹ️ Лимит кнопок команд достигнут (максимум 9).'
      : 'ℹ️ Команды уже есть в списке.'
    await sendEphemeral(context, msg, 4000)
    return true
  }

  if (isFootballSiteEnabled()) {
    await registerVkListLinkOnFootballSite({
      peerId: event.peerId,
      gameEventId: event.id,
      teamSlots: [...slots],
    })
  }

  await refreshList({ vk, store, context, event })
  return true
}

