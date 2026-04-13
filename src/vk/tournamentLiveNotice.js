import { Keyboard } from 'vk-io'
import { resolveGroupIdForApi } from './groupId.js'

const randomSendId = () => Math.floor(Math.random() * 10000) * Date.now()

/**
 * Публичный URL табло (кнопка в уведомлении «игра началась»). Можно переопределить через env.
 * @returns {string}
 */
export function getTournamentPublicUrl() {
  const raw = process.env.TOURNAMENT_PUBLIC_URL || process.env.FOOTBALL_PUBLIC_URL || ''
  const u = String(raw).trim()
  if (u) return u.replace(/\/+$/, '') || 'https://tournament.pavelsolntsev.ru'
  return 'https://tournament.pavelsolntsev.ru'
}

/**
 * Одна кнопка-ссылка на сайт турнира (inline).
 * @param {string} [publicUrl]
 */
export function buildLiveNoticeKeyboard(publicUrl) {
  const base = (publicUrl || getTournamentPublicUrl()).replace(/\/+$/, '')
  const url = `${base}/`
  return Keyboard.builder().inline().urlButton({
    label: 'Открыть табло турнира',
    url: url.startsWith('http') ? url : `https://${url}`,
  })
}

/**
 * Удалить отдельное уведомление «игра началась», если мы сохранили его id (как у списка).
 * @param {import('vk-io').VK} vk
 * @param {{ peerId: number, event: Record<string, unknown> }} args
 */
export async function deleteLiveNoticeMessage(vk, { peerId, event }) {
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    peer_id: peerId,
    delete_for_all: 1,
  }
  const cmid = event.liveNoticeConversationMessageId
  const mid = event.liveNoticeMessageId
  if (cmid != null && cmid > 0) {
    params.cmids = [cmid]
  } else if (mid != null && mid > 0) {
    params.message_ids = [mid]
  } else {
    return
  }
  if (groupId != null) {
    params.group_id = groupId
  }
  await vk.api.messages.delete(params)
  event.liveNoticeConversationMessageId = null
  event.liveNoticeMessageId = null
}

/**
 * Отдельное сообщение в беседу: матч перешёл в live, даём ссылки на трансляцию.
 * Id пишем в объект события — когда матч закончился, сообщение удаляем (как список).
 * @param {import('vk-io').VK} vk
 * @param {number} peerId
 * @param {Record<string, unknown>} event — событие из store
 */
export async function sendTournamentLiveNotice(vk, peerId, event) {
  const communityUrl = 'https://vk.com/rmsfootball'
  const body =
    `⚽ Игра началась!\n\n` +
    `📣 Трансляция игр в сообществе: ${communityUrl}\n\n` +
    `📊 Счёт и статистика — на сайте ${getTournamentPublicUrl()}/\n` +
    `или по кнопке ниже.`
  const keyboard = buildLiveNoticeKeyboard()
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    message: body,
    random_id: randomSendId(),
    keyboard: keyboard.toString(),
    dont_parse_links: 1,
  }
  if (groupId != null) {
    params.group_id = groupId
    params.peer_ids = peerId
  } else {
    params.peer_id = peerId
  }
  const raw = await vk.api.messages.send(params)
  if (Array.isArray(raw) && raw.length > 0) {
    const item = raw[0]
    if (item && typeof item === 'object') {
      const cmid = item.conversation_message_id ?? null
      const mid = item.message_id ?? null
      event.liveNoticeConversationMessageId = typeof cmid === 'number' && cmid > 0 ? cmid : null
      event.liveNoticeMessageId = typeof mid === 'number' && mid > 0 ? mid : null
      return
    }
  }
  if (typeof raw === 'number') {
    event.liveNoticeMessageId = raw > 0 ? raw : null
    event.liveNoticeConversationMessageId = null
  }
}
