import { Keyboard } from 'vk-io'
import { sendPrivateMessage } from '../../vk/sendPrivateMessage.js'
import { logError } from '../../utils/botLog.js'

const TOURNAMENT_URL = 'https://tournament.pavelsolntsev.ru/'

const RDY_TEXT = '✅ Составы готовы. Таблица турнира по кнопке ниже.'

function buildRdyKeyboard() {
  return Keyboard.builder().inline().urlButton({ label: '📋 Таблица', url: TOURNAMENT_URL })
}

function collectRealPlayerIds(event) {
  const main = Array.isArray(event.participantsOrder) ? event.participantsOrder : []
  const queue = Array.isArray(event.queueOrder) ? event.queueOrder : []
  return [...new Set([...main, ...queue])].filter((id) => typeof id === 'number' && id > 0)
}

export async function runRdy({ vk, context, event }) {
  const keyboard = buildRdyKeyboard()

  // Ошибка отправки в чат не должна ронять весь обработчик.
  try {
    await context.send({
      message: RDY_TEXT,
      keyboard,
    })
  } catch (err) {
    logError('rdy/group', err, { peerId: context?.peerId })
  }

  const ids = collectRealPlayerIds(event)
  // Рассылаем в ЛС безопасно: один неуспех не прерывает остальных.
  const results = await Promise.allSettled(
    ids.map((userId) => sendPrivateMessage(vk, userId, RDY_TEXT, { keyboard })),
  )
  for (const [idx, r] of results.entries()) {
    if (r.status === 'rejected') {
      logError('rdy/private', r.reason, { userId: ids[idx] })
    }
  }
}
