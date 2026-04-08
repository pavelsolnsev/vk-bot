import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'
import { getAdminVkIds } from '../auth/admin.js'
import { fetchVkRatingsOnFootballSite } from './footballApi.js'

/** @param {'plus' | 'play_button'} source */
function joinSourceLabel(source) {
  return source === 'plus' ? 'команда «+» в чате' : 'кнопка «Играть»'
}

/** @param {'minus' | 'leave_button'} source */
function leaveSourceLabel(source) {
  return source === 'minus' ? 'команда «-» в чате' : 'кнопка «Выйти»'
}

/** Подпись как в списке ВК: username из БД сайта; иначе «человеческий» domain ВК (не idNNN). */
function pickNicknameForAdminLine(siteLabel, vkDomain, userId) {
  const fromSite = siteLabel != null && String(siteLabel).trim() !== '' ? String(siteLabel).trim() : ''
  if (fromSite) return fromSite
  const d = vkDomain != null && String(vkDomain).trim() !== '' ? String(vkDomain).trim() : ''
  if (d && !/^id\d+$/i.test(d)) return d
  return `id${userId}`
}

/** Ник и имя: ник из сайта (как в турнирном списке), имя из users.get. */
async function vkUserNameLines(vk, userId) {
  let siteLabel = ''
  try {
    const pack = await fetchVkRatingsOnFootballSite({ vkUserIds: [userId] })
    siteLabel = pack?.siteDisplayByVkId?.get(userId) ?? ''
  } catch {
    // сайт недоступен — только ВК
  }

  try {
    const users = await vk.api.users.get({ user_ids: [userId], fields: 'domain' })
    const u = users?.[0]
    if (!u) {
      return [`Ник: ${pickNicknameForAdminLine(siteLabel, null, userId)}`, 'Имя: —']
    }
    const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—'
    const rawDomain =
      u.domain != null && String(u.domain).trim() !== '' ? String(u.domain).trim() : null
    const nick = pickNicknameForAdminLine(siteLabel, rawDomain, userId)
    return [`Ник: ${nick}`, `Имя: ${name}`]
  } catch {
    return [`Ник: ${pickNicknameForAdminLine(siteLabel, null, userId)}`, 'Имя: —']
  }
}

/**
 * Уведомить всех админов (VK_ADMIN_IDS) в ЛС о записи игрока.
 * @param {'plus' | 'play_button'} params.source
 * @param {'main' | 'queue'} params.rosterStatus
 */
export async function notifyAdminsPlayerJoined(vk, { userId, source, rosterStatus }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return

  const rosterRu = rosterStatus === 'main' ? 'основной состав' : 'очередь'
  const whoLines = await vkUserNameLines(vk, userId)
  const lines = [
    '🟢 Игрок записался в список',
    ...whoLines,
    `Способ: ${joinSourceLabel(source)}`,
    `Куда: ${rosterRu}`,
  ]

  const message = lines.join('\n')
  await Promise.all(
    admins.map((adminId) => sendPrivateMessage(vk, adminId, message, { dont_parse_links: 1 })),
  )
}

/**
 * @param {'minus' | 'leave_button'} params.source
 * @param {'main' | 'queue'} params.leftFrom
 */
export async function notifyAdminsPlayerLeft(vk, { userId, source, leftFrom }) {
  const admins = getAdminVkIds()
  if (!admins.length || typeof userId !== 'number' || userId <= 0) return
  if (leftFrom !== 'main' && leftFrom !== 'queue') return

  const whereRu = leftFrom === 'main' ? 'основной состав' : 'очередь'
  const whoLines = await vkUserNameLines(vk, userId)
  const lines = [
    '🔴 Игрок вышел из списка',
    ...whoLines,
    `Способ: ${leaveSourceLabel(source)}`,
    `Был в: ${whereRu}`,
  ]

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

