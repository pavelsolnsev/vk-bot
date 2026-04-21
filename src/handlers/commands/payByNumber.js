import { getUserIdByIndex, getUserIdByTeamIndex } from './indexByNumber.js'
import { refreshList } from './context.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { parsePayRosterCommand, parseUnpayRosterCommand } from '../../parsers/adminChatCommands.js'
import { getFootballApiAuth } from '../../services/footballApi/siteMode.js'
import { setPlayerPaidOnFootballSite } from '../../services/footballApi/vkSiteRequests.js'

export async function tryPayByNumber({ vk, store, context, event, text }) {
  const parsed = parsePayRosterCommand(text)
  if (!parsed) return false

  const userId =
    parsed.mode === 'team'
      ? getUserIdByTeamIndex(event, parsed.teamRaw, parsed.number)
      : getUserIdByIndex(event, parsed.number)
  if (userId == null) {
    // Явно подсказываем, чтобы админ понял, что индекс/команда не сошлись.
    await sendEphemeral(context, '⚠️ Игрок не найден: проверь команду и номер.', 4500)
    return true
  }

  if (getFootballApiAuth()) {
    const sync = await setPlayerPaidOnFootballSite({ vkUserId: userId, paid: true })
    if (!sync || sync.ok !== true) {
      await sendEphemeral(context, '⚠️ Не удалось отметить оплату на сайте.', 4500)
      return true
    }
  }

  event.paidParticipants.add(userId)
  await refreshList({ vk, store, context, event })
  return true
}

export async function tryUnpayByNumber({ vk, store, context, event, text }) {
  const parsed = parseUnpayRosterCommand(text)
  if (!parsed) return false

  const userId =
    parsed.mode === 'team'
      ? getUserIdByTeamIndex(event, parsed.teamRaw, parsed.number)
      : getUserIdByIndex(event, parsed.number)
  if (userId == null) {
    // Явно подсказываем, чтобы админ понял, что индекс/команда не сошлись.
    await sendEphemeral(context, '⚠️ Игрок не найден: проверь команду и номер.', 4500)
    return true
  }

  if (getFootballApiAuth()) {
    const sync = await setPlayerPaidOnFootballSite({ vkUserId: userId, paid: false })
    if (!sync || sync.ok !== true) {
      await sendEphemeral(context, '⚠️ Не удалось снять оплату на сайте.', 4500)
      return true
    }
  }

  event.paidParticipants.delete(userId)
  await refreshList({ vk, store, context, event })
  return true
}

