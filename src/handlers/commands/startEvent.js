import { parseStartCommand, parseTestStartCommand } from '../../parsers/startCommand.js'
import { refreshList } from './context.js'

export async function tryStartEvent({ vk, store, context, text, peerId, senderId }) {
  const startCmd = parseTestStartCommand(text) ?? parseStartCommand(text)
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
  return 'started'
}

