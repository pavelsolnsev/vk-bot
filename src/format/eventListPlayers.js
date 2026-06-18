import {
  LIST_NAME_MAX_DISPLAY_WIDTH,
  stripEmojiFromName,
  truncateToDisplayWidth,
} from './playerName.js'
import { findTeamSlotLabel } from '../parsers/startCommand.js'

function ratingIcon(ratingValue) {
  if (ratingValue < 10) return '⭐'
  if (ratingValue < 30) return '💫'
  if (ratingValue < 60) return '✨'
  if (ratingValue < 100) return '🌠'
  if (ratingValue < 150) return '💎'
  return '🏆'
}

function normalizeRatingValue(rating) {
  const numeric = Number(rating)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 10) / 10
}

function formatRatingValue(rating) {
  const safe = normalizeRatingValue(rating)
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1)
}

function formatRatingLabel(rating) {
  const safe = normalizeRatingValue(rating)
  const value = formatRatingValue(safe)
  return `${ratingIcon(safe)}${value}`
}

/**
 * Ссылка на профиль ВК (BBCode). Не использовать | ] [ в подписи.
 */
function vkProfileMention(userId, displayLabel) {
  if (typeof userId !== 'number' || userId <= 0) return null
  const safe = String(displayLabel).replace(/[[\]|]/g, '').trim()
  if (!safe) return null
  return `[id${userId}|${safe}]`
}

function resolveVkUserId(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Одна строка списка с номером места (основа или очередь — снаружи передаём нужный номер). */
function formatNumberedPlayerLine(displayNo, name, paidFlag, userIdRaw, ratingValue) {
  const indexPrefix = `${displayNo}.`
  const clean = stripEmojiFromName(String(name ?? '').trim()) || 'Unknown'
  const label = truncateToDisplayWidth(clean, LIST_NAME_MAX_DISPLAY_WIDTH)
  const uid = resolveVkUserId(userIdRaw)
  const mention = uid > 0 ? vkProfileMention(uid, label) : null
  const namePart = mention ?? label
  const ratingLabel = formatRatingLabel(ratingValue)
  const paidMark = paidFlag === true ? ' ✅' : ''
  return `${indexPrefix} ${namePart} ${ratingLabel}${paidMark}`
}

/** Ник (или [id|ник]) + один пробел + иконка и значение рейтинга. */
function formatPlayerBlockLines(names, paid, ids, ratings) {
  const list = names ?? []
  if (!list.length) return [`— пока никто не записался`]

  return list.map((n, i) =>
    formatNumberedPlayerLine(
      i + 1,
      n,
      paid?.[i],
      ids?.[i],
      ratings?.[i],
    ),
  )
}

function teamLabelForUser(teamSlots, teamMap, userId) {
  if (!(teamMap instanceof Map)) return null
  const t = teamMap.get(userId)
  if (typeof t !== 'string' || !t) return null
  // Нормализуем старые/ручные метки (регистр/пробелы), чтобы человек не пропадал между блоками.
  return findTeamSlotLabel(teamSlots, t)
}

/** Основной список с заголовками команд (порядок мест 1…N как в participantsOrder). */
function formatPlayersBlockGrouped(
  names,
  paid,
  participantIds,
  participantRatings,
  teamSlots,
  teamMap,
) {
  const lines = [`🏆 В игре:`]
  const ids = participantIds ?? []
  if (!ids.length) {
    lines.push(`— пока никто не записался`)
    return lines.join('\n') + '\n'
  }

  const used = new Set()
  let wroteAnyTeamSection = false
  for (const slot of teamSlots) {
    const chunk = []
    let displayNo = 0
    for (let i = 0; i < ids.length; i += 1) {
      if (teamLabelForUser(teamSlots, teamMap, ids[i]) !== slot) continue
      used.add(ids[i])
      displayNo += 1
      chunk.push(
        formatNumberedPlayerLine(
          displayNo,
          names[i],
          paid?.[i],
          ids[i],
          participantRatings?.[i],
        ),
      )
    }
    if (!chunk.length) continue
    if (wroteAnyTeamSection) lines.push('')
    lines.push(`▸ ${slot}`)
    lines.push(...chunk)
    wroteAnyTeamSection = true
  }

  const loose = []
  let looseNo = 0
  for (let i = 0; i < ids.length; i += 1) {
    if (used.has(ids[i])) continue
    looseNo += 1
    loose.push(
      formatNumberedPlayerLine(
        looseNo,
        names[i],
        paid?.[i],
        ids[i],
        participantRatings?.[i],
      ),
    )
  }
  if (loose.length) {
    if (wroteAnyTeamSection) lines.push('')
    lines.push(`▸ Без команды`)
    lines.push(...loose)
  }

  return lines.join('\n') + '\n'
}

/** Очередь с теми же заголовками команд; номера строк — место в очереди (как раньше). */
function formatQueueBlockGrouped(queueNames, queueIds, queueRatings, teamSlots, teamMap) {
  if (!queueNames?.length) return ''
  const lines = [`📢 Очередь:`]
  const ids = queueIds ?? []
  const used = new Set()
  let wroteAnyTeamSection = false

  for (const slot of teamSlots) {
    const chunk = []
    let displayNo = 0
    for (let i = 0; i < ids.length; i += 1) {
      if (teamLabelForUser(teamSlots, teamMap, ids[i]) !== slot) continue
      used.add(ids[i])
      displayNo += 1
      chunk.push(
        formatNumberedPlayerLine(
          displayNo,
          queueNames[i],
          null,
          ids[i],
          queueRatings?.[i],
        ),
      )
    }
    if (!chunk.length) continue
    if (wroteAnyTeamSection) lines.push('')
    lines.push(`▸ ${slot}`)
    lines.push(...chunk)
    wroteAnyTeamSection = true
  }

  const loose = []
  let looseNo = 0
  for (let i = 0; i < ids.length; i += 1) {
    if (used.has(ids[i])) continue
    looseNo += 1
    loose.push(
      formatNumberedPlayerLine(
        looseNo,
        queueNames[i],
        null,
        ids[i],
        queueRatings?.[i],
      ),
    )
  }
  if (loose.length) {
    if (wroteAnyTeamSection) lines.push('')
    lines.push(`▸ Без команды`)
    lines.push(...loose)
  }

  return lines.join('\n') + '\n'
}

export function formatPlayersBlock(
  names,
  paid,
  limit,
  participantIds,
  participantRatings,
  teamOptions = null,
) {
  const slots = teamOptions?.teamSlots
  const map = teamOptions?.participantTeamByVkId
  if (Array.isArray(slots) && slots.length && map instanceof Map) {
    return formatPlayersBlockGrouped(names, paid, participantIds, participantRatings, slots, map)
  }
  const header = [`🏆 В игре:`]
  const playerLines = formatPlayerBlockLines(names, paid, participantIds, participantRatings)
  return [...header, ...playerLines].join('\n') + '\n'
}

export function formatQueueBlock(
  queueNames,
  queueIds,
  queueRatings,
  teamOptions = null,
) {
  if (!queueNames?.length) return ''
  const slots = teamOptions?.teamSlots
  const map = teamOptions?.participantTeamByVkId
  if (Array.isArray(slots) && slots.length && map instanceof Map) {
    return formatQueueBlockGrouped(queueNames, queueIds, queueRatings, slots, map)
  }
  const header = [`📢 Очередь:`]
  const lines = formatPlayerBlockLines(queueNames, null, queueIds, queueRatings)
  return [...header, ...lines].join('\n') + '\n'
}

/** Ключ команды как в roster.js (один пробел, без краёв, нижний регистр). */
function teamKey(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Лимит команды из карты teamLimits (Map<normKey, number>), иначе дефолт. */
function teamLimitNumber(teamLimits, slot, defaultLimit) {
  const v = teamLimits instanceof Map ? teamLimits.get(teamKey(slot)) : undefined
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : defaultLimit
}

/** id → данные строки (имя, оплата, рейтинг) из параллельных массивов. */
function buildLineDataMap(names, paid, ids, ratings) {
  const map = new Map()
  const list = ids ?? []
  for (let i = 0; i < list.length; i += 1) {
    map.set(list[i], { name: names?.[i], paid: paid?.[i], rating: ratings?.[i] })
  }
  return map
}

/**
 * Командный режим: для каждой команды — заголовок «N) Имя — X/лимит», основа,
 * и сразу под ней очередь этой команды. В конце — «Без команды» (без лимита и очереди).
 * Заменяет отдельные блоки «В игре» + «Очередь».
 */
export function formatTeamSectionsBlock({
  names,
  paid,
  participantIds,
  participantRatings,
  queueNames,
  queueIds,
  queueRatings,
  teamSlots,
  teamMap,
  teamLimits,
  defaultLimit,
}) {
  const mainData = buildLineDataMap(names, paid, participantIds, participantRatings)
  const queueData = buildLineDataMap(queueNames, null, queueIds, queueRatings)
  const mainIds = participantIds ?? []
  const queueAllIds = queueIds ?? []

  const lines = [`🏆 Составы:`]
  const usedMain = new Set()
  const usedQueue = new Set()

  for (const slot of teamSlots) {
    const mainOfTeam = mainIds.filter((id) => teamLabelForUser(teamSlots, teamMap, id) === slot)
    const queueOfTeam = queueAllIds.filter((id) => teamLabelForUser(teamSlots, teamMap, id) === slot)
    const limit = teamLimitNumber(teamLimits, slot, defaultLimit)

    lines.push('')
    lines.push(`▸ ${slot} — ${mainOfTeam.length}/${limit}`)
    if (!mainOfTeam.length) {
      lines.push('— пока никто не записался')
    } else {
      mainOfTeam.forEach((id, i) => {
        const d = mainData.get(id) ?? {}
        usedMain.add(id)
        lines.push(formatNumberedPlayerLine(i + 1, d.name, d.paid, id, d.rating))
      })
    }
    if (queueOfTeam.length) {
      // Очередь команды — отдельным вложенным блоком: пустая строка + отступ,
      // чтобы она не сливалась с основой команды.
      lines.push('')
      lines.push(`   ⏳ Очередь в ${slot}`)
      queueOfTeam.forEach((id, i) => {
        const d = queueData.get(id) ?? {}
        usedQueue.add(id)
        lines.push(`   ${formatNumberedPlayerLine(i + 1, d.name, null, id, d.rating)}`)
      })
    }
  }

  // «Без команды» — только основа, без лимита и очереди.
  const looseMain = mainIds.filter((id) => !usedMain.has(id))
  if (looseMain.length) {
    lines.push('')
    lines.push(`▸ Без команды`)
    looseMain.forEach((id, i) => {
      const d = mainData.get(id) ?? {}
      lines.push(formatNumberedPlayerLine(i + 1, d.name, d.paid, id, d.rating))
    })
  }
  // Подстраховка: очередь без команды в норме не появляется, но людей не теряем.
  const looseQueue = queueAllIds.filter((id) => !usedQueue.has(id))
  if (looseQueue.length) {
    lines.push('')
    lines.push(`   ⏳ Очередь (без команды)`)
    looseQueue.forEach((id, i) => {
      const d = queueData.get(id) ?? {}
      lines.push(`   ${formatNumberedPlayerLine(i + 1, d.name, null, id, d.rating)}`)
    })
  }

  return lines.join('\n') + '\n'
}
