import { eventListLocations } from './eventListLocations.js'
import { formatPlayersBlock, formatQueueBlock, formatTeamSectionsBlock } from './eventListPlayers.js'
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
  teamLimits = null,
  defaultTeamLimit = 8,
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

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
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
      if (teamOptions) {
        // Командный режим: один объединённый блок — у каждой команды своя основа и очередь под ней.
        text += formatTeamSectionsBlock({
          names,
          paid,
          participantIds,
          participantRatings,
          queueNames,
          queueIds,
          queueRatings,
          teamSlots: teamOptions.teamSlots,
          teamMap: teamOptions.participantTeamByVkId,
          teamLimits,
          defaultLimit: defaultTeamLimit,
        })
      } else {
        text += formatPlayersBlock(
          names,
          paid,
          maxPlayers ?? loc?.limit,
          participantIds,
          participantRatings,
          teamOptions,
        )
        // Пустая строка между «В игре» и следующим списком (очередь), чтобы в ВК не слипалось.
        if (blocks[i + 1] === 'queue') {
          text += '\n'
        }
      }
    } else if (block === 'queue') {
      // В командном режиме очередь уже встроена в блок команд — отдельный блок пропускаем.
      if (!teamOptions) {
        text += formatQueueBlock(queueNames, queueIds, queueRatings, teamOptions)
      }
    } else if (block === 'summary') {
      // В командном режиме общий лимит не имеет смысла — показываем только число игроков.
      text += formatSummaryBlock(names.length, teamOptions ? undefined : (maxPlayers ?? loc?.limit))
    }
  }

  return text
}
