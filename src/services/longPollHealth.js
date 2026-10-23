// Здоровье соединения с ВК (Bots Long Poll), по которому приходят нажатия кнопок.
// vk-io сам переподключается при сбоях, но молча — в логах этого не видно. А бывало, что нажатия
// просто не доходили до бота (у человека бесконечно крутилась кнопка). Здесь:
// — считаем и логируем каждое переподключение (частые переподключения = канал слушает кто-то ещё,
//   например второй запущенный бот с тем же токеном — тогда часть нажатий уходит ему);
// — следим, когда ВК последний раз ответил на опрос. В норме это раз в ~25 секунд даже без событий;
//   если ответов нет дольше LONG_POLL_SILENCE_MS — соединение зависло, переподключаемся сами.
import { logError, logEvent } from '../utils/botLog.js'

const LONG_POLL_SILENCE_MS = 2 * 60 * 1000
const CHECK_EVERY_MS = 30 * 1000

/**
 * @param {import('vk-io').VK} vk
 * @param {{ onStuck?: (idleMs: number) => void | Promise<void> }} [opts]
 */
export function installLongPollHealth(vk, opts = {}) {
  const transport = vk.updates?.pollingTransport
  const state = { lastResponseAt: Date.now(), connects: 0 }
  if (!transport || typeof transport.fetchUpdates !== 'function' || typeof transport.start !== 'function') {
    logEvent('longpoll', 'не удалось подключить контроль long-poll (другая версия vk-io?)')
    return state
  }

  // Каждый ответ ВК на опрос (с событиями или пустой) — признак живого соединения.
  const origFetch = transport.fetchUpdates.bind(transport)
  transport.fetchUpdates = async () => {
    const result = await origFetch()
    state.lastResponseAt = Date.now()
    return result
  }

  // Каждое (пере)подключение: первое — обычный старт, остальные пишем в лог.
  const origStart = transport.start.bind(transport)
  transport.start = async () => {
    state.connects += 1
    if (state.connects > 1) {
      logEvent('longpoll', 'переподключение к ВК', { connects: state.connects })
    }
    const result = await origStart()
    state.lastResponseAt = Date.now()
    return result
  }

  let restarting = false
  setInterval(async () => {
    if (restarting || !transport.started) return
    const idleMs = Date.now() - state.lastResponseAt
    if (idleMs < LONG_POLL_SILENCE_MS) return
    restarting = true
    logEvent('longpoll', 'ВК не отвечает на опрос — переподключаемся', { idleMs })
    try {
      await opts.onStuck?.(idleMs)
    } catch (err) {
      logError('longpoll/onStuck', err)
    }
    try {
      await vk.updates.stop()
      await vk.updates.start()
    } catch (err) {
      logError('longpoll/restart', err)
    } finally {
      // Даже если старт не удался, даём vk-io шанс восстановиться и не долбим каждые 30 секунд.
      state.lastResponseAt = Date.now()
      restarting = false
    }
  }, CHECK_EVERY_MS)

  return state
}
