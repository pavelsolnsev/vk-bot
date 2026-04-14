import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'
import { getAdminVkIds } from '../auth/admin.js'
import { fetchVkPlayerProfileOnFootballSite } from './footballApi.js'

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

/**
 * Уведомить всех админов (VK_ADMIN_IDS) в ЛС о записи игрока.
 * Доп. поля в params (source, rosterStatus) оставлены у вызывающего кода, в текст не входят.
 */
export async function notifyAdminsPlayerJoined(vk, { userId }) {
  // Отправляем уведомление всем админам, включая самого игрока-админа.
  // Это нужно, чтобы админ видел подтверждение в ЛС, даже если он записался сам.
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return

  const whoLines = await vkUserNameLines(vk, userId)
  const lines = ['➕ Игрок записался в список', ...whoLines]

  const message = lines.join('\n')
  await Promise.all(
    admins.map((adminId) => sendPrivateMessage(vk, adminId, message, { dont_parse_links: 1 })),
  )
}

/**
 * Доп. поля в params (source, leftFrom) оставлены у вызывающего кода, в текст не входят.
 * @param {'main' | 'queue'} params.leftFrom — по-прежнему валидируется.
 */
export async function notifyAdminsPlayerLeft(vk, { userId, leftFrom }) {
  // Как и при join: уведомляем всех админов, включая самого игрока-админа.
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  if (leftFrom !== 'main' && leftFrom !== 'queue') return

  const whoLines = await vkUserNameLines(vk, userId)
  const lines = ['➖ Игрок вышел из списка', ...whoLines]

  const message = lines.join('\n')
  await Promise.all(
    admins.map((adminId) => sendPrivateMessage(vk, adminId, message, { dont_parse_links: 1 })),
  )
}

export async function notifyPromotedToMain(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await Promise.all(uniq.map((id) => sendPrivateMessage(vk, id, '🎉 Вы в основном составе!')))
}

export async function notifyMovedToQueue(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await Promise.all(uniq.map((id) => sendPrivateMessage(vk, id, '⚠️ Вы перемещены в очередь.')))
}

export async function notifyJoinedQueue(vk, userId) {
  if (typeof userId !== 'number' || userId <= 0) return
  await sendPrivateMessage(vk, userId, '📢 Вы записаны в очередь.')
}

