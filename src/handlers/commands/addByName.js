import { joinEvent } from '../../services/roster.js'
import { createVirtualPlayerId, setVirtualPlayerName } from '../../services/virtualPlayers.js'
import { refreshList } from './context.js'

export async function tryAddByName({ vk, store, context, event, text }) {
  const m = text.match(/^\+add\s+(.+)$/iu)
  if (!m) return false

  const name = m[1].trim()
  if (!name) return true

  const id = createVirtualPlayerId()
  setVirtualPlayerName(store.userNameCache, id, name)
  joinEvent(event, id)

  await refreshList({ vk, store, context, event })
  return true
}

