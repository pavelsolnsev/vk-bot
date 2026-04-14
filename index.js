import 'dotenv/config'
import { VK } from 'vk-io'
import { createEventStore } from './src/store/eventStore.js'
import { createMessageNewHandler } from './src/handlers/messageNew.js'
import { createMessageEventHandler } from './src/handlers/messageEvent.js'
import { startNotifyLoop } from './src/services/checkTimeAndNotify.js'
import { stopSiteRosterPoll } from './src/services/siteRosterPoll.js'
import { initializeFootballSiteMode } from './src/services/footballApi.js'
import { setSiteListPollStop } from './src/handlers/commands/closeEvent.js'
import { logError, logWarn } from './src/utils/botLog.js'
import { getAdminVkIds } from './src/auth/admin.js'

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

const vk = new VK({ token: process.env.VK_TOKEN })
const store = createEventStore()

// Пауза между попытками перезапуска long-poll (если VK временно недоступен).
const RESTART_BASE_MS = Number(process.env.VK_UPDATES_RESTART_BASE_MS || 2_000)
const RESTART_MAX_MS = Number(process.env.VK_UPDATES_RESTART_MAX_MS || 60_000)
// Пульс-лог раз в 30 минут: реже пишем в лог, но всё ещё видно, что процесс жив.
const HEARTBEAT_MS = Number(process.env.VK_BOT_HEARTBEAT_MS || 30 * 60 * 1000)
// После N подряд ошибок long-poll отправляем алерт админам.
const ALERT_CONSECUTIVE_ERRORS = Number(process.env.VK_ALERT_CONSECUTIVE_ERRORS || 3)
// Защита от спама одинаковыми алертами.
const ALERT_COOLDOWN_MS = Number(process.env.VK_ALERT_COOLDOWN_MS || 10 * 60 * 1000)

function normalizeMs(v, fallback) {
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const restartBaseMs = normalizeMs(RESTART_BASE_MS, 2_000)
const restartMaxMs = normalizeMs(RESTART_MAX_MS, 60_000)
const heartbeatMs = normalizeMs(HEARTBEAT_MS, 30 * 60 * 1000)
const alertConsecutiveErrors = normalizeMs(ALERT_CONSECUTIVE_ERRORS, 3)
const alertCooldownMs = normalizeMs(ALERT_COOLDOWN_MS, 10 * 60 * 1000)

const runtimeStats = {
  startedAtMs: Date.now(),
  messageNewHandled: 0,
  messageEventHandled: 0,
  topLevelErrors: 0,
  updatesRestartCount: 0,
  updatesConsecutiveErrors: 0,
  lastTopLevelErrorAtMs: 0,
}

const alertStateByKey = new Map()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calcRestartDelayMs(attempt) {
  // Делаем плавный рост паузы: 2s, 4s, 8s... и ограничиваем верхней границей.
  const a = Math.max(0, Number(attempt) || 0)
  const next = restartBaseMs * (2 ** a)
  return Math.min(next, restartMaxMs)
}

function collectErrorText(err) {
  const parts = []
  let current = err
  let depth = 0
  while (current && depth < 5) {
    if (current instanceof Error) {
      parts.push(current.message, current.stack || '')
    } else {
      parts.push(String(current))
    }
    current = current.cause
    depth += 1
  }
  return parts.join('\n').toLowerCase()
}

function isPollingAlreadyStartedError(err) {
  const text = collectErrorText(err)
  return (
    text.includes('polling updates already started')
    || (text.includes('polling') && text.includes('already started'))
  )
}

function formatUptime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}h ${m}m ${s}s`
}

function randomSendId() {
  return Math.floor(Math.random() * 10000) * Date.now()
}

async function sendAdminAlert(message) {
  const adminIds = getAdminVkIds()
  if (!adminIds.length) return
  const results = await Promise.allSettled(
    adminIds.map((adminId) =>
      vk.api.messages.send({
        user_id: adminId,
        random_id: randomSendId(),
        message,
        dont_parse_links: 1,
      })),
  )
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) {
    logWarn('alerts/send', `Не удалось отправить ${failed} из ${adminIds.length} алертов админам`)
  }
}

async function maybeSendAdminAlert(key, message) {
  const now = Date.now()
  const lastAt = Number(alertStateByKey.get(key) || 0)
  if (now - lastAt < alertCooldownMs) return
  alertStateByKey.set(key, now)
  try {
    await sendAdminAlert(message)
  } catch (err) {
    logError('alerts/maybeSend', err, { key })
  }
}

async function reportTopLevelError(scope, err) {
  runtimeStats.topLevelErrors += 1
  runtimeStats.lastTopLevelErrorAtMs = Date.now()
  logError(scope, err)
  const e = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  await maybeSendAdminAlert(
    `top:${scope}`,
    `🚨 vk-bot top-level ошибка\nscope: ${scope}\nerror: ${e}\ntime: ${new Date().toISOString()}`,
  )
}

async function stopUpdatesSafe(reason) {
  try {
    await vk.updates.stop()
    logWarn('updates/stop', `Остановили активный long-poll (${reason})`)
    return true
  } catch (stopErr) {
    logError('updates/stop', stopErr, { reason })
    return false
  }
}

process.on('unhandledRejection', (reason) => {
  void reportTopLevelError(
    'unhandledRejection',
    reason instanceof Error ? reason : new Error(String(reason)),
  )
})

process.on('uncaughtException', (err) => {
  // Не завершаем процесс: для long-poll бота лучше продолжать работу, чем полностью упасть.
  // Критичные ошибки всё равно попадут в логи и админ-алерт.
  void reportTopLevelError('uncaughtException', err)
})

function startHeartbeat() {
  // Пишем короткий лог по таймеру, чтобы в логах было видно, что бот не завис.
  setInterval(() => {
    const uptime = formatUptime(Date.now() - runtimeStats.startedAtMs)
    logWarn(
      'heartbeat',
      `vk-bot alive | uptime=${uptime} | message_new=${runtimeStats.messageNewHandled} | message_event=${runtimeStats.messageEventHandled} | top_errors=${runtimeStats.topLevelErrors} | updates_restarts=${runtimeStats.updatesRestartCount} | updates_consecutive_errors=${runtimeStats.updatesConsecutiveErrors}`,
    )
  }, heartbeatMs)
}

const handleMessageNew = createMessageNewHandler({ vk, store })
const handleMessageEvent = createMessageEventHandler({ vk, store })

vk.updates.on('message_new', async (context) => {
  runtimeStats.messageNewHandled += 1
  try {
    await handleMessageNew(context)
  } catch (err) {
    // Доп. страховка: даже если внутри обработчика что-то не поймали, бот не должен падать.
    await reportTopLevelError('updates/message_new', err)
  }
})

vk.updates.on('message_event', async (context) => {
  runtimeStats.messageEventHandled += 1
  try {
    await handleMessageEvent(context)
  } catch (err) {
    // Доп. страховка для callback-обработчика.
    await reportTopLevelError('updates/message_event', err)
  }
})

async function runUpdatesForever() {
  let attempt = 0
  // Бесконечный цикл: если long-poll упал, ждём и стартуем снова.
  while (true) {
    try {
      await vk.updates.start()
      // В vk-io start() не «висит» до остановки polling: он сразу возвращает управление, а опрос идёт в фоне.
      // Если здесь снова вызвать start() в следующей итерации цикла — будет «Polling updates already started».
      attempt = 0
      runtimeStats.updatesConsecutiveErrors = 0
      logWarn(
        'updates/start',
        'Long-poll запущен (start() вернулся — это нормально для vk-io). Ждём, не вызывая start() повторно.',
      )
      await new Promise(() => {})
    } catch (err) {
      // Отдельный сценарий: polling уже запущен (обычно двойной старт или второй процесс).
      // Не считаем это как "падения подряд", иначе алерты будут бесконечно расти.
      if (isPollingAlreadyStartedError(err)) {
        logWarn('updates/start', 'Polling updates already started — пробуем мягко перезапустить long-poll')
        await maybeSendAdminAlert(
          'updates/already-started',
          '⚠️ vk-bot: получена ошибка "Polling updates already started". ' +
          'Пробуем stop() и повторный запуск. Проверьте, что запущен только один процесс бота.',
        )
        await stopUpdatesSafe('already-started')
        attempt = 0
        runtimeStats.updatesConsecutiveErrors = 0
        const delayMs = Math.min(restartBaseMs, 5_000)
        await sleep(delayMs)
        continue
      }

      logError('updates/start', err, { attempt: attempt + 1 })
      attempt += 1
      runtimeStats.updatesRestartCount += 1
      runtimeStats.updatesConsecutiveErrors = attempt
      if (attempt >= alertConsecutiveErrors) {
        const e = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        await maybeSendAdminAlert(
          'updates/consecutive-errors',
          `🚨 vk-bot: long-poll падает подряд (${attempt} раз)\nlast_error: ${e}\nnext_restart_in_ms: ${calcRestartDelayMs(attempt)}`,
        )
      }
    }
    const delayMs = calcRestartDelayMs(attempt)
    logWarn('updates/restart', `Перезапуск long-poll через ${delayMs} ms`, { attempt })
    await sleep(delayMs)
  }
}

async function main() {
  await initializeFootballSiteMode()
  setSiteListPollStop(stopSiteRosterPoll)
  startNotifyLoop(vk, store)
  startHeartbeat()
  await runUpdatesForever()
}

main().catch((e) => {
  logError('main', e)
  process.exit(1)
})
