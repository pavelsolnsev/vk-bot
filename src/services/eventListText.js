import { buildEventListText } from '../format/eventListMessage.js'
import { stripDuplicateListBlocks } from '../format/stripDuplicateListBlocks.js'
import { resolveUserNames } from '../vk/userNames.js'

export async function buildEventListMessageBody(vk, userNameCache, event) {
  const participants = Array.isArray(event.participantsOrder)
    ? event.participantsOrder
    : [...(event.participants || [])]
  const queue = Array.isArray(event.queueOrder) ? event.queueOrder : [...(event.queue || [])]

  const allIds = [...participants, ...queue]
  const allNames = await resolveUserNames(vk, userNameCache, allIds)
  const names = allNames.slice(0, participants.length)
  const queueNames = allNames.slice(participants.length)

  const paid = participants.map((id) => event.paidParticipants?.has(id) === true)
  const body = buildEventListText({
    date: event.date,
    time: event.time,
    place: event.place,
    names,
    paid,
    queueNames,
    maxPlayers: event.maxPlayers,
  })
  return stripDuplicateListBlocks(body)
}
