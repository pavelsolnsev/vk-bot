import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'
import { getAdminVkIds } from '../auth/admin.js'
import { fetchVkRatingsOnFootballSite } from './footballApi.js'

/** Подпись как в списке ВК: username из БД сайта; иначе «человеческий» domain ВК (не idNNN). */
function pickNicknameForAdminLine(siteLabel, vkDomain, userId) {
  const fromSite = siteLabel != null && String(siteLabel).trim() !== '' ? String(siteLabel).trim() : ''
  if (fromSite) return fromSite
  const d = vkDomain != null && String(vkDomain).trim() !== '' ? String(vkDomain).trim() : ''
  if (d && !/^id\d+$/i.test(d)) return d
  return `id${userId}`
}

function isSkippableDisplayName(s) {
  if (s === false) return true
  const t = String(s ?? '').trim()
  if (!t) return true
  if (t === '—' || t === '-') return true
  if (/^@?unknown$/i.test(t)) return true
  return false
}

function namesEquivalent(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

/** Строки «Имя:» (сайт/domain) и «Ник:» (ВК имя+фамилия) для админки; пустые и unknown не показываем; при совпадении — одна строка. */
async function vkUserNameLines(vk, userId) {
  let siteLabel = ''
  let listLabelFromDbName = false
  try {
    const pack = await fetchVkRatingsOnFootballSite({
      vkUserIds: [userId],
      bypassCache: true,
    })
    const raw = pack?.siteDisplayByVkId?.get(userId)
    if (raw !== false && raw != null) siteLabel = String(raw).trim()
    listLabelFromDbName = pack?.listLabelFromDbNameByVkId?.get(userId) === true
  } catch {
    // сайт недоступен — только ВК
  }

  let firstName = ''
  let lastName = ''
  let rawDomain = null
  try {
    const users = await vk.api.users.get({ user_ids: [userId], fields: 'domain' })
    const u = users?.[0]
    if (u) {
      firstName = u.first_name ?? ''
      lastName = u.last_name ?? ''
      rawDomain =
        u.domain != null && String(u.domain).trim() !== '' ? String(u.domain).trim() : null
    }
  } catch {
    // только сайт / id
  }

  const name = `${firstName} ${lastName}`.trim()
  const nick = pickNicknameForAdminLine(siteLabel, rawDomain, userId)

  const nickOk = !isSkippableDisplayName(nick)
  const nameOk = !isSkippableDisplayName(name)

  if (listLabelFromDbName && nickOk) {
    return [`Имя: ${nick}`]
  }

  if (nickOk && nameOk && namesEquivalent(nick, name)) {
    return [`Ник: ${name}`]
  }
  const out = []
  if (nickOk) out.push(`Имя: ${nick}`)
  if (nameOk) out.push(`Ник: ${name}`)
  return out
}

/**
 * Уведомить всех админов (VK_ADMIN_IDS) в ЛС о записи игрока.
 * Доп. поля в params (source, rosterStatus) оставлены у вызывающего кода, в текст не входят.
 */
export async function notifyAdminsPlayerJoined(vk, { userId }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return

  const whoLines = await vkUserNameLines(vk, userId)
  const lines = ['🟢 Игрок записался в список', ...whoLines]

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
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  if (leftFrom !== 'main' && leftFrom !== 'queue') return

  const whoLines = await vkUserNameLines(vk, userId)
  const lines = ['🔴 Игрок вышел из списка', ...whoLines]

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

