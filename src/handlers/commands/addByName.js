import { joinEvent } from '../../services/roster.js'
import { setVirtualPlayerName } from '../../services/virtualPlayers.js'
import { refreshList } from './context.js'
import { createSyntheticPlayerOnFootballSite } from '../../services/footballApi.js'
import { syncFootballAfterJoin } from '../../services/footballRosterSync.js'
import { sendEphemeral } from '../../vk/sendEphemeral.js'
import { matchAddByNameCommand, parseAddByNameBody } from '../../parsers/adminChatCommands.js'

export async function tryAddByName({ vk, store, context, event, text }) {
  const m = matchAddByNameCommand(text)
  if (!m) return false

  const { playerName: name, team } = parseAddByNameBody(m.body, event.teamSlots)
  if (!name) return true

  const created = await createSyntheticPlayerOnFootballSite({ name })
  if (!created?.ok || typeof created.vk_user_id !== 'number') {
    await sendEphemeral(
      context,
      'Не удалось создать игрока на сайте. Проверь FOOTBALL_API_URL и токен (FOOTBALL_TOKEN = VK_TOKEN на сервере).',
      6500,
    )
    return true
  }

  const vkId = created.vk_user_id
  setVirtualPlayerName(store.userNameCache, vkId, created.name ?? name)
  const res = joinEvent(event, vkId, team ? { team } : {})
  const rolledBack = await syncFootballAfterJoin(vk, vkId, res, {
    event,
    overrideFirstName: created.name ?? name,
    overrideLastName: '',
    onBlocked: () =>
      sendEphemeral(context, '⚠️ Идёт live-матч, запись в турнир на сайте закрыта.', 5000),
  })
  await refreshList({ vk, store, context, event })
  return true
}
