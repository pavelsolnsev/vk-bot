import {
  parseStartCommand,
  parseTestStartCommand,
  parsePresetStartCommand,
} from '../../parsers/startCommand.js'
import { refreshList } from './context.js'
import { registerVkListLinkOnFootballSite } from '../../services/footballApi.js'

export async function tryStartEvent({ vk, store, context, text, peerId, senderId }) {
  const startCmd =
    parseTestStartCommand(text) ??
    parsePresetStartCommand(text) ??
    parseStartCommand(text)
  if (!startCmd) return false

  const lastId = store.getLastEventId(peerId)
  if (lastId && store.getEvent(lastId)) {
    return 'already_started'
  }

  const event = store.createEvent({
    peerId,
    senderId,
    date: startCmd.date,
    time: startCmd.time,
    place: startCmd.place,
  })

  await refreshList({ vk, store, context, event })
  // Связь peer + id события на сайте — без этого обратная синхронизация сайт→ВК не работает.
  await registerVkListLinkOnFootballSite({ peerId, gameEventId: event.id })
  return 'started'
}

