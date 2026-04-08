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
 * Отдельное сообщение в беседу: матч перешёл в live, даём ссылки на трансляцию.
 * @param {import('vk-io').VK} vk
 * @param {number} peerId
 */
export async function sendTournamentLiveNotice(vk, peerId) {
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
  await vk.api.messages.send(params)
}
