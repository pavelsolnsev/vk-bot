import 'dotenv/config'
import { VK } from 'vk-io'
import { createEventStore } from './src/store/eventStore.js'
import { createMessageNewHandler } from './src/handlers/messageNew.js'
import { createMessageEventHandler } from './src/handlers/messageEvent.js'
import { startNotifyLoop } from './src/services/checkTimeAndNotify.js'

if (!process.env.VK_TOKEN) {
  console.error('Не найден VK_TOKEN. Добавьте его в .env рядом с index.js')
  process.exit(1)
}

const vk = new VK({ token: process.env.VK_TOKEN })
const store = createEventStore()

vk.updates.on('message_new', createMessageNewHandler({ vk, store }))
vk.updates.on('message_event', createMessageEventHandler({ vk, store }))

async function main() {
  await vk.updates.start()
  startNotifyLoop(vk, store)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
