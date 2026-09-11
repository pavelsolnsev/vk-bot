// Список в ВК жил только в памяти процесса: любой рестарт — деплой, ребут, pm2 —
// оставлял в чате сообщение с мёртвыми кнопками. Бот получал нажатие, не находил
// список по id и молча выходил, а синхронизация с сайтом вообще не поднималась.
// Здесь состояние стора сохраняется на диск и поднимается при старте.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logError, logWarn } from '../utils/botLog.js'

const STATE_VERSION = 1
const DEFAULT_SAVE_INTERVAL_MS = 3000
/** Списки старше недели не поднимаем — это точно прошлый матч, а не тот, что висит в чате. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Путь к файлу состояния: рядом с ботом, чтобы не зависеть от cwd под pm2. */
export function eventStoreFilePath() {
  const fromEnv = String(process.env.VK_BOT_STATE_FILE || '').trim()
  if (fromEnv) return fromEnv
  return fileURLToPath(new URL('../../data/events.json', import.meta.url))
}

// В событии есть Map и Set (составы, команды, лимиты, оплаты) — JSON их не умеет,
// поэтому помечаем тип и восстанавливаем обратно. Кодируем любые поля, включая те,
// что дописываются в рантайме, — чтобы ничего не потерялось при новых правках.
function encodeValue(value) {
  if (value instanceof Map) {
    return { __type: 'Map', entries: [...value.entries()].map(([k, v]) => [k, encodeValue(v)]) }
  }
  if (value instanceof Set) {
    return { __type: 'Set', values: [...value.values()].map(encodeValue) }
  }
  if (Array.isArray(value)) return value.map(encodeValue)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v)
    return out
  }
  return value
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue)
  if (value && typeof value === 'object') {
    if (value.__type === 'Map') {
      return new Map((value.entries ?? []).map(([k, v]) => [k, decodeValue(v)]))
    }
    if (value.__type === 'Set') {
      return new Set((value.values ?? []).map(decodeValue))
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v)
    return out
  }
  return value
}

/** Снимок стора для записи на диск. */
export function serializeStore(store) {
  return {
    version: STATE_VERSION,
    savedAt: Date.now(),
    events: [...store.events.values()].map(encodeValue),
    lastEventByPeer: [...store.lastEventByPeer.entries()],
  }
}

/** Заливает снимок в пустой стор. Возвращает число поднятых списков. */
export function hydrateStore(store, data, { now = Date.now(), maxAgeMs = MAX_EVENT_AGE_MS } = {}) {
  if (!data || typeof data !== 'object') return 0
  if (Number(data.version) !== STATE_VERSION) return 0

  const restoredIds = new Set()
  for (const raw of Array.isArray(data.events) ? data.events : []) {
    const event = decodeValue(raw)
    if (!event || typeof event !== 'object' || !event.id) continue
    const createdAt = Number(event.createdAt)
    if (Number.isFinite(createdAt) && now - createdAt > maxAgeMs) continue
    store.events.set(event.id, event)
    restoredIds.add(event.id)
  }

  for (const [peerId, eventId] of Array.isArray(data.lastEventByPeer) ? data.lastEventByPeer : []) {
    if (!restoredIds.has(eventId)) continue
    store.lastEventByPeer.set(peerId, eventId)
  }

  return restoredIds.size
}

/** Поднимает списки прошлого запуска. Битый или отсутствующий файл — просто пустой старт. */
export function loadEventStoreFromDisk(store, filePath = eventStoreFilePath()) {
  try {
    if (!existsSync(filePath)) return 0
    const raw = readFileSync(filePath, 'utf8')
    if (!raw.trim()) return 0
    return hydrateStore(store, JSON.parse(raw))
  } catch (err) {
    logWarn('eventStore/load', 'Не удалось прочитать сохранённое состояние — стартуем с пустым списком', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/** Последний записанный JSON — чтобы не трогать диск, когда ничего не менялось. */
let lastWritten = null

/** Пишет состояние атомарно: сначала во временный файл, потом переименование. */
export function saveEventStoreToDisk(store, { filePath = eventStoreFilePath(), force = false } = {}) {
  try {
    const snapshot = serializeStore(store)
    // savedAt меняется всегда, поэтому сравниваем только содержательную часть.
    const body = JSON.stringify({ ...snapshot, savedAt: 0 })
    if (!force && body === lastWritten) return false

    mkdirSync(dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(snapshot), 'utf8')
    renameSync(tmp, filePath)
    lastWritten = body
    return true
  } catch (err) {
    logError('eventStore/save', err, { filePath })
    return false
  }
}

/** Периодическая запись состояния. Возвращает функцию остановки. */
export function startEventStorePersist(store, intervalMs = DEFAULT_SAVE_INTERVAL_MS) {
  const timer = setInterval(() => {
    saveEventStoreToDisk(store)
  }, intervalMs)
  // Таймер не должен держать процесс живым при завершении.
  timer.unref?.()
  return () => clearInterval(timer)
}
