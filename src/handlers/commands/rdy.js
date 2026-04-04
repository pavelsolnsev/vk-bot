import { Keyboard } from 'vk-io'
import { sendPrivateMessage } from '../../vk/sendPrivateMessage.js'

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

  await context.send({
    message: RDY_TEXT,
    keyboard,
  })

  const ids = collectRealPlayerIds(event)
  await Promise.all(ids.map((userId) => sendPrivateMessage(vk, userId, RDY_TEXT, { keyboard })))
}
