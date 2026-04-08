import { buildEventListText } from '../format/eventListMessage.js'
import { stripDuplicateListBlocks } from '../format/stripDuplicateListBlocks.js'
import { fetchVkRatingsOnFootballSite } from './footballApi.js'
import { resolveUserNames } from '../vk/userNames.js'

export async function buildEventListMessageBody(vk, userNameCache, event) {
  const participants = Array.isArray(event.participantsOrder)
    ? event.participantsOrder
    : [...(event.participants || [])]
  const queue = Array.isArray(event.queueOrder) ? event.queueOrder : [...(event.queue || [])]

  const allIds = [...participants, ...queue]
  const ratingsPack = await fetchVkRatingsOnFootballSite({ vkUserIds: allIds })
  const ratingsMap = ratingsPack?.ratings ?? new Map()
  const siteDisplayByVkId = ratingsPack?.siteDisplayByVkId ?? new Map()
  const needVkName = Array.from(new Set(allIds.filter((id) => !siteDisplayByVkId.has(id))))
  const vkFallbackById = new Map()
  if (needVkName.length) {
    const vkListed = await resolveUserNames(vk, userNameCache, needVkName)
    needVkName.forEach((id, i) => vkFallbackById.set(id, vkListed[i]))
  }
  const allNames = allIds.map((id) => siteDisplayByVkId.get(id) || vkFallbackById.get(id) || 'Unknown')
  const names = allNames.slice(0, participants.length)
  const queueNames = allNames.slice(participants.length)
  const participantRatings = participants.map((id) => ratingsMap.get(id) ?? 0)
  const queueRatings = queue.map((id) => ratingsMap.get(id) ?? 0)

  const paid = participants.map((id) => event.paidParticipants?.has(id) === true)
  const body = buildEventListText({
    date: event.date,
    time: event.time,
    place: event.place,
    names,
    paid,
    queueNames,
    maxPlayers: event.maxPlayers,
    participantIds: participants,
    participantRatings,
    queueIds: queue,
    queueRatings,
  })
  return stripDuplicateListBlocks(body)
}
