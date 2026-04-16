import { refreshList } from './context.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { ensureRoster } from '../../services/roster.js'
import { findTeamSlotLabel } from '../../parsers/startCommand.js'
import { matchRemoveTeamSlotCommand } from '../../parsers/adminChatCommands.js'

export async function tryRemoveTeamSlot({ vk, store, context, event, text }) {
  const m = matchRemoveTeamSlotCommand(text)
  if (!m) return false

  ensureRoster(event)

  const slots = Array.isArray(event.teamSlots) ? event.teamSlots : []
  if (!slots.length) return true

  const matched = findTeamSlotLabel(slots, m.teamRaw)
  if (!matched) {
    await sendEphemeral(context, '⚠️ Такой команды нет.', 3500)
    return true
  }

  // Удаляем слот из списка кнопок/секций.
  event.teamSlots = slots.filter((s) => s !== matched)

  // Стираем метку команды у всех игроков, кто был в этой команде → уйдут в «Без команды».
  if (event.participantTeamByVkId instanceof Map) {
    for (const [vkId, label] of event.participantTeamByVkId.entries()) {
      if (findTeamSlotLabel([matched], label) === matched) {
        event.participantTeamByVkId.delete(vkId)
      }
    }
  }

  await refreshList({ vk, store, context, event })
  return true
}

