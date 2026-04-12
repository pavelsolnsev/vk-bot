import {
  LIST_NAME_MAX_DISPLAY_WIDTH,
  stripEmojiFromName,
  truncateToDisplayWidth,
} from './playerName.js'

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

/** Ник (или [id|ник]) + один пробел + иконка и значение рейтинга. */
function formatPlayerBlockLines(names, paid, ids, ratings) {
  const list = names ?? []
  if (!list.length) return [`— пока никто не записался`]

  return list.map((n, i) => {
    const indexPrefix = `${i + 1}.`
    const clean = stripEmojiFromName(String(n ?? '').trim()) || 'Unknown'
    const label = truncateToDisplayWidth(clean, LIST_NAME_MAX_DISPLAY_WIDTH)
    const uid = resolveVkUserId(ids?.[i])
    const mention = uid > 0 ? vkProfileMention(uid, label) : null
    const namePart = mention ?? label
    const ratingLabel = formatRatingLabel(ratings?.[i])
    const paidMark = paid?.[i] === true ? ' ✅' : ''
    return `${indexPrefix} ${namePart} ${ratingLabel}${paidMark}`
  })
}

export function formatPlayersBlock(names, paid, limit, participantIds, participantRatings) {
  const header = [`🏆 В игре:`]
  const playerLines = formatPlayerBlockLines(names, paid, participantIds, participantRatings)
  return [...header, ...playerLines].join('\n') + '\n'
}

export function formatQueueBlock(queueNames, queueIds, queueRatings) {
  if (!queueNames?.length) return ''
  const header = [`📢 Очередь:`]
  const lines = formatPlayerBlockLines(queueNames, null, queueIds, queueRatings)
  // ведущий перенос, чтобы отделить от блока "В игре"
  return '\n' + [...header, ...lines].join('\n') + '\n'
}
