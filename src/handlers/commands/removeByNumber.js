import { getUserIdByIndex, getUserIdByTeamIndex } from './indexByNumber.js'
import { refreshList } from './context.js'
import { leaveEvent } from '../../services/roster.js'
import { notifyPromotedToMain } from '../../services/dmNotifications.js'
import { removePlayerFromFootballSite } from '../../services/footballApi.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { parseRemoveRosterCommand } from '../../parsers/adminChatCommands.js'
import { isVkTournamentTrListEvent } from '../../utils/vkTournamentListEvent.js'

export async function tryRemoveByNumber({ vk, store, context, event, text }) {
  const parsed = parseRemoveRosterCommand(text)
  if (!parsed) return false

  if (parsed.mode === 'team' && !isVkTournamentTrListEvent(event)) {
    await sendEphemeral(vk, context, 'ℹ️ Удаление «r Команда N» только для турнира (s tr). Используй rN.', 5000)
    return true
  }

  const userId =
    parsed.mode === 'team'
      ? getUserIdByTeamIndex(event, parsed.teamRaw, parsed.number)
      : getUserIdByIndex(event, parsed.number)
  if (userId == null) {
    // Подсказка для админа, если команда/номер введены с ошибкой.
    await sendEphemeral(vk, context, '⚠️ Игрок не найден: проверь команду и номер.', 4500)
    return true
  }

  const inRoster = event.participants.has(userId) || event.queue.has(userId)
  if (!inRoster) {
    await refreshList({ vk, store, context, event })
    return true
  }

  // Сначала сайт — при live не снимаем человека из списка ВК.
  const apiRes = await removePlayerFromFootballSite({ vkUserId: userId })
  if (apiRes?.tournamentLive) {
    await sendEphemeral(vk, context, '⚠️ Идёт live-матч, снять с турнира на сайте нельзя.', 5000)
    await refreshList({ vk, store, context, event })
    return true
  }

  // Строку в players удаляет только админ на сайте или вручную в БД — здесь только состав турнира.
  const res = leaveEvent(event, userId)
  if (res?.promoted?.length) {
    await notifyPromotedToMain(vk, res.promoted)
  }

  await refreshList({ vk, store, context, event })
  return true
}
