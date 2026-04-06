import 'dotenv/config'
import { VK } from 'vk-io'
import { createEventStore } from './src/store/eventStore.js'
import { createMessageNewHandler } from './src/handlers/messageNew.js'
import { createMessageEventHandler } from './src/handlers/messageEvent.js'
import { startNotifyLoop } from './src/services/checkTimeAndNotify.js'
import { startSiteRosterPoll } from './src/services/siteRosterPoll.js'
import { logError, logWarn } from './src/utils/botLog.js'

if (!process.env.VK_TOKEN) {
  console.error('Не найден VK_TOKEN. Добавьте его в .env рядом с index.js')
  process.exit(1)
}

const url = process.env.FOOTBALL_API_URL
const ft = process.env.FOOTBALL_TOKEN
if (!url || !ft) {
  logWarn(
    'startup',
    'FOOTBALL_API_URL или FOOTBALL_TOKEN не заданы — запись на сайт, поллинг состава и закрытие списка с сайта работать не будут.',
  )
}

process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)))
})

process.on('uncaughtException', (err) => {
  logError('uncaughtException', err)
  process.exit(1)
})

const vk = new VK({ token: process.env.VK_TOKEN })
const store = createEventStore()

vk.updates.on('message_new', createMessageNewHandler({ vk, store }))
vk.updates.on('message_event', createMessageEventHandler({ vk, store }))

async function main() {
  await vk.updates.start()
  startNotifyLoop(vk, store)
  startSiteRosterPoll(vk, store)
}

main().catch((e) => {
  logError('main', e)
  process.exit(1)
})
