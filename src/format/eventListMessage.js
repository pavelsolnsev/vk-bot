import { eventListLocations } from './eventListLocations.js'
import { formatPlayersBlock, formatQueueBlock } from './eventListPlayers.js'
import {
  formatDateHeading,
  formatExtraBlock,
  formatInstructionsBlock,
  formatLocationBlock,
  formatPaymentBlock,
  formatSummaryBlock,
  formatTournamentTitle,
} from './eventListSections.js'

/**
 * place — код локации (kz/prof/tr/saturn) или произвольный текст.
 */
export function buildEventListText({
  date,
  time,
  place,
  names,
  paid,
  queueNames,
  maxPlayers,
  /** параллельно names — id VK для [id|…] */
  participantIds,
  participantRatings,
  /** параллельно queueNames */
  queueIds,
  queueRatings,
  teamSlots = null,
  participantTeamByVkId = null,
}) {
  const placeKey = String(place || '')
    .trim()
    .toLowerCase()
  const loc = eventListLocations[placeKey] || null

  const teamOptions =
    Array.isArray(teamSlots) && teamSlots.length && participantTeamByVkId instanceof Map
      ? { teamSlots, participantTeamByVkId }
      : null

  const blocks = loc
    ? loc.blocks
    : ['date', 'location_fallback', 'instructions', 'players', 'summary']

  let text = ''

  for (const block of blocks) {
    if (block === 'date') {
      text += formatDateHeading(date, time)
    } else if (block === 'location') {
      text += formatLocationBlock(loc)
    } else if (block === 'location_fallback') {
      const placeLine = String(place || '').trim()
      text += `📍 МЕСТО ИГРЫ\n`
      text += `▸ ${placeLine || 'уточняется'}\n\n`
    } else if (block === 'tournamentTitle') {
      text += formatTournamentTitle()
    } else if (block === 'extra') {
      text += formatExtraBlock(loc)
    } else if (block === 'payment') {
      text += formatPaymentBlock(loc)
    } else if (block === 'instructions') {
      text += formatInstructionsBlock({ teamPickMode: Boolean(teamOptions) })
    } else if (block === 'players') {
      text += formatPlayersBlock(
        names,
        paid,
        maxPlayers ?? loc?.limit,
        participantIds,
        participantRatings,
        teamOptions,
      )
    } else if (block === 'queue') {
      text += formatQueueBlock(queueNames, queueIds, queueRatings, teamOptions)
    } else if (block === 'summary') {
      text += formatSummaryBlock(names.length, maxPlayers ?? loc?.limit)
    }
  }

  return text
}
