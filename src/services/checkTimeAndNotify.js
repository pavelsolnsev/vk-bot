import { resolveGroupIdForApi } from '../vk/groupId.js'
import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const ONE_MINUTE_MS = 60 * 1000

const randomId = () => Math.floor(Math.random() * 10000) * Date.now()

const TOURNAMENT_ONLINE_URL = 'https://tournament.pavelsolntsev.ru/'

const locations = {
  kz: { name: 'Красное Знамя', sum: 500 },
  prof: { name: 'Профилакторий', sum: 500 },
  saturn: { name: 'Сатурн', sum: 600 },
  tr: { name: 'Турнир' },
}

const notifyLiveLine = `\n📺 Следи за ходом турнира в режиме онлайн: ${TOURNAMENT_ONLINE_URL}`

function parseEventDateTime({ dateDdMmYyyy, timeHhMm }) {
  const [dd, mm, yyyy] = String(dateDdMmYyyy).split('.').map(Number)
  const [hh, min] = String(timeHhMm).split(':').map(Number)
  const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function formatWhen(d) {
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function buildNotifyText(event, startsAt) {
  const key = String(event.place || '').trim().toLowerCase()
  const loc = locations[key]

  if (key === 'tr') {
    return (
      '🏆 ⚡ Турнир ⚡\n\n' +
      '⏰ Начало через 3 часа!\n' +
      `📅 Когда: ${formatWhen(startsAt)}\n` +
      `📍 Локация: ${loc?.name || event.place}\n\n` +
      '✅ Что нужно сделать:\n' +
      '• Прибыть за 15 минут до начала\n' +
      notifyLiveLine +
      '\n'
    )
  }

  const sumLine = typeof loc?.sum === 'number' ? `• Оплатить участие (${loc.sum} ₽)\n` : ''

  return (
    '⏰ Матч начнётся через 3 часа!\n\n' +
    `📍 Локация: ${loc?.name || event.place}\n` +
    `📅 Когда: ${formatWhen(startsAt)}\n\n` +
    '✅ Что нужно сделать:\n' +
    '• Подготовить экипировку\n' +
    sumLine +
    '• Прибыть за 15 минут до начала\n' +
    notifyLiveLine +
    '\n'
  )
}

async function sendGroupMessage(vk, peerId, message) {
  const groupId = resolveGroupIdForApi(vk)
  const params = {
    peer_id: peerId,
    random_id: randomId(),
    message,
    dont_parse_links: 1,
  }
  if (groupId != null) params.group_id = groupId

  const raw = await vk.api.messages.send(params)
  return typeof raw === 'number' ? raw : raw?.[0]?.message_id
}

async function deleteMessageLater(vk, peerId, messageId, delayMs) {
  if (!Number.isFinite(messageId) || messageId <= 0) return
  const groupId = resolveGroupIdForApi(vk)
  setTimeout(() => {
    const params = { peer_id: peerId, delete_for_all: 1, message_ids: [messageId] }
    if (groupId != null) params.group_id = groupId
    vk.api.messages.delete(params).catch(() => {})
  }, delayMs)
}

/**
 * Проверка раз в минуту: если до матча <= 3 часа, шлём уведомление в беседу и в ЛС игрокам.
 * Отправляем один раз на событие (event.notificationSent).
 */
export async function checkTimeAndNotify(vk, store) {
  const now = new Date()

  for (const event of store.events.values()) {
    if (!event || event.notificationSent) continue

    const startsAt = parseEventDateTime({ dateDdMmYyyy: event.date, timeHhMm: event.time })
    if (!startsAt) continue

    const diff = startsAt.getTime() - now.getTime()
    if (diff <= 0) continue

    if (diff > THREE_HOURS_MS) continue

    // защита от повторов в окне одной минуты
    event.notificationSent = true

    const text = buildNotifyText(event, startsAt)

    try {
      const msgId = await sendGroupMessage(vk, event.peerId, text)
      // как в телеграм-боте: удаляем через 3 часа
      await deleteMessageLater(vk, event.peerId, msgId, THREE_HOURS_MS)
    } catch {
      // даже если в беседу не получилось — не спамим повторно
    }

    // ЛС игрокам основного состава (как в telegram-bot: только players, не queue)
    const ids = Array.isArray(event.participantsOrder) ? event.participantsOrder : [...(event.participants || [])]
    const uniq = [...new Set(ids)].filter((id) => typeof id === 'number' && id > 0)
    await Promise.all(
      uniq.map((id) => sendPrivateMessage(vk, id, text, { dont_parse_links: 1 })),
    )
  }
}

export function startNotifyLoop(vk, store) {
  setInterval(() => {
    checkTimeAndNotify(vk, store).catch(() => {})
  }, ONE_MINUTE_MS)
}

