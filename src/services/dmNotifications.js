import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'
import { getAdminVkIds, isAdmin } from '../auth/admin.js'
import { fetchVkPlayerProfileOnFootballSite } from './footballApi.js'
import { logError } from '../utils/botLog.js'

function isSkippableDisplayName(s) {
  if (s === false) return true
  const t = String(s ?? '').trim()
  if (!t) return true
  if (t === '—' || t === '-') return true
  if (/^@?unknown$/i.test(t)) return true
  return false
}

function sanitizeDbName(v) {
  const t = String(v ?? '').trim()
  if (!t) return null
  return t
}

function sanitizeDbUsername(v) {
  const t = String(v ?? '').trim()
  if (!t) return null
  if (/^@?unknown$/i.test(t)) return null
  return t
}

/**
 * Строки имени для админского уведомления.
 * Источник только БД сайта: name -> «Ник», username -> «Имя».
 */
function buildNameLinesFromDbProfile(profile) {
  const name = sanitizeDbName(profile?.name)
  const username = sanitizeDbUsername(profile?.username)

  // 1) Оба поля есть: показываем две строки в фиксированном порядке.
  if (name && username) {
    return [`name: ${name}`, `username: ${username}`]
  }
  // 2) Только username: показываем только «Имя».
  if (!name && username) {
    return [`username: ${username}`]
  }
  // 3) Только name: показываем только «Ник».
  if (name && !username) {
    return [`name: ${name}`]
  }
  return []
}

/** Строки для уведомления: сначала БД, если пусто — мягкий fallback на VK имя. */
async function vkUserNameLines(vk, userId) {
  // Берём профиль напрямую с сайта без кэша, чтобы ручные правки в БД отражались сразу.
  try {
    const profile = await fetchVkPlayerProfileOnFootballSite({ vkUserId: userId })
    const dbLines = buildNameLinesFromDbProfile(profile)
    if (dbLines.length) return dbLines
  } catch {
    // Если сайт недоступен — пробуем fallback ниже.
  }

  // Fallback только когда в БД нет валидных полей или сайт недоступен.
  let firstName = ''
  let lastName = ''
  try {
    const users = await vk.api.users.get({ user_ids: [userId] })
    const u = users?.[0]
    if (u) {
      firstName = u.first_name ?? ''
      lastName = u.last_name ?? ''
    }
  } catch {
    // Ничего не делаем — ниже вернём пусто.
  }

  const name = `${firstName} ${lastName}`.trim()
  if (isSkippableDisplayName(name)) return []
  return [`username: ${name}`]
}

async function sendAdminBroadcast(vk, adminIds, message, scope) {
  // Promise.allSettled: падение одной ЛС не должно ломать всё уведомление.
  const results = await Promise.allSettled(
    adminIds.map((adminId) => sendPrivateMessage(vk, adminId, message, { dont_parse_links: 1 })),
  )
  for (const [idx, r] of results.entries()) {
    if (r.status === 'rejected') {
      logError(scope, r.reason, { adminId: adminIds[idx] })
    }
  }
}

async function sendUserBroadcast(vk, userIds, message, scope) {
  // Массовая отправка в ЛС без падения всего потока из-за одного user_id.
  const results = await Promise.allSettled(
    userIds.map((id) => sendPrivateMessage(vk, id, message)),
  )
  for (const [idx, r] of results.entries()) {
    if (r.status === 'rejected') {
      logError(scope, r.reason, { userId: userIds[idx] })
    }
  }
}

/**
 * Уведомить всех админов о записи игрока.
 * rosterStatus: 'main' | 'queue' — показывает куда попал.
 * team: string | undefined — команда, если выбрана.
 */
export async function notifyAdminsPlayerJoined(vk, { userId, rosterStatus, team }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  // Когда записывается сам админ — уведомление не нужно.
  if (isAdmin(userId)) return

  let whoLines = []
  try {
    whoLines = await vkUserNameLines(vk, userId)
  } catch (err) {
    logError('notifyAdminsPlayerJoined/nameLines', err, { userId })
  }

  const statusLabel = rosterStatus === 'queue' ? 'очередь' : 'основа'
  const header = `➕ Игрок записался · ${statusLabel}`
  const lines = [header, ...whoLines]
  if (team) lines.push(`команда: ${team}`)

  await sendAdminBroadcast(vk, admins, lines.join('\n'), 'notifyAdminsPlayerJoined/send')
}

/**
 * Уведомить всех админов о том, что VK-сообщение со списком не обновилось (ошибка edit).
 */
export async function notifyAdminsListUpdateFailed(vk, { peerId, errorMessage }) {
  const admins = getAdminVkIds()
  if (!admins.length) return

  const lines = [
    '⚠️ Игрок записался, но список не обновился',
    '→ Проверь чат, игрок есть в списке но не видит себя',
    `чат: ${peerId}`,
    `ошибка: ${errorMessage ?? '—'}`,
  ]
  await sendAdminBroadcast(vk, admins, lines.join('\n'), 'notifyAdminsListUpdateFailed/send')
}

/**
 * Уведомить всех админов о том, что игрок пытался записаться, но был заблокирован (live-матч).
 */
export async function notifyAdminsJoinBlocked(vk, { userId, team }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  if (isAdmin(userId)) return

  let whoLines = []
  try {
    whoLines = await vkUserNameLines(vk, userId)
  } catch (err) {
    logError('notifyAdminsJoinBlocked/nameLines', err, { userId })
  }

  const lines = ['⛔ Попытка записи — заблокировано (live-матч)', ...whoLines]
  if (team) lines.push(`команда: ${team}`)

  await sendAdminBroadcast(vk, admins, lines.join('\n'), 'notifyAdminsJoinBlocked/send')
}

/**
 * Доп. поля в params (source, leftFrom) оставлены у вызывающего кода, в текст не входят.
 * @param {'main' | 'queue'} params.leftFrom — по-прежнему валидируется.
 */
export async function notifyAdminsPlayerLeft(vk, { userId, leftFrom }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  if (leftFrom !== 'main' && leftFrom !== 'queue') return
  if (isAdmin(userId)) return

  let whoLines = []
  try {
    // Если чтение профиля/ВК упало — шлём хотя бы базовый заголовок, без падения бота.
    whoLines = await vkUserNameLines(vk, userId)
  } catch (err) {
    logError('notifyAdminsPlayerLeft/nameLines', err, { userId, leftFrom })
  }
  const lines = ['➖ Игрок вышел из списка', ...whoLines]

  const message = lines.join('\n')
  await sendAdminBroadcast(vk, admins, message, 'notifyAdminsPlayerLeft/send')
}

export async function notifyPromotedToMain(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await sendUserBroadcast(vk, uniq, '🎉 Вы в основном составе!', 'notifyPromotedToMain/send')
}

export async function notifyMovedToQueue(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await sendUserBroadcast(vk, uniq, '⚠️ Вы перемещены в очередь.', 'notifyMovedToQueue/send')
}

export async function notifyJoinedQueue(vk, userId) {
  if (typeof userId !== 'number' || userId <= 0) return
  await sendPrivateMessage(vk, userId, '📢 Вы записаны в очередь.')
}

