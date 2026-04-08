// Сервис для связи с football-сайтом.
// Вызывается когда пользователь нажимает «Играть» или «Выйти» — регистрирует или убирает его из проекта.

import { logError, logHttpNotOk, logWarn } from '../utils/botLog.js'
import mysql from 'mysql2/promise'

const S = 'footballApi'
let didWarnDbConfigMissing = false
let didWarnRuntimeApiFailure = false
let dbPool = null
let footballSiteMode = 'uninitialized'
let siteRecoveryProbeInFlight = false
let lastSiteRecoveryProbeAt = 0

function getApiTimeoutMs() {
  const timeout = Number(process.env.FOOTBALL_API_TIMEOUT_MS || 5000)
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 5000
}

function getApiIdempotencyWindowMs() {
  const ms = Number(process.env.FOOTBALL_API_IDEMPOTENCY_WINDOW_MS || 5000)
  return Number.isFinite(ms) && ms > 0 ? ms : 5000
}

function buildApiIdempotencyKey(action, vkUserId) {
  const bucket = Math.floor(Date.now() / getApiIdempotencyWindowMs())
  return `${action}:${vkUserId}:${bucket}`
}

function getSiteRecoveryProbeMs() {
  const ms = Number(process.env.FOOTBALL_API_RECHECK_MS || 30_000)
  return Number.isFinite(ms) && ms > 0 ? ms : 30_000
}

function isFootballHttpLogEnabled() {
  const v = (process.env.FOOTBALL_API_HTTP_LOG || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function isFootballHttpLogBodyEnabled() {
  const v = (process.env.FOOTBALL_API_HTTP_LOG_BODY || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function formatPathForHttpLog(url) {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return url
  }
}

/** Лог исходящих запросов к football-сайту (без токена; он только в заголовке). */
function logFootballHttpLine(method, pathWithQuery, statusText, ms, bodyHint) {
  const base = `[vk-bot:${S}/http]`
  const line = `${base} ${method} ${pathWithQuery} → ${statusText} ${ms}ms`
  if (bodyHint) {
    console.log(line, { body: bodyHint })
  } else {
    console.log(line)
  }
}

async function fetchWithTimeout(url, init) {
  const httpLogEnabled = isFootballHttpLogEnabled()
  const method = String(init?.method || 'GET').toUpperCase()
  const pathWithQuery = formatPathForHttpLog(url)
  let bodyHint = ''
  if (httpLogEnabled && isFootballHttpLogBodyEnabled() && init?.body != null) {
    const raw = typeof init.body === 'string' ? init.body : String(init.body)
    bodyHint = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getApiTimeoutMs())
  const started = Date.now()
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (httpLogEnabled) {
      const ms = Date.now() - started
      logFootballHttpLine(method, pathWithQuery, String(response.status), ms, bodyHint)
    }
    return response
  } catch (err) {
    if (httpLogEnabled) {
      const ms = Date.now() - started
      const name = err instanceof Error ? err.name : 'Error'
      const msg = err instanceof Error ? err.message : String(err)
      logFootballHttpLine(method, pathWithQuery, `${name}: ${msg}`, ms, bodyHint)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function isNetworkFetchFailure(err) {
  if (!(err instanceof Error)) return false
  if (err.message !== 'fetch failed') return false
  return true
}

function isTimeoutError(err) {
  return err instanceof Error && err.name === 'AbortError'
}

function getFootballApiAuth() {
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN
  if (!apiUrl || !token) return null
  if (footballSiteMode !== 'enabled') {
    maybeScheduleFootballSiteRecoveryProbe({ apiUrl, token })
    return null
  }
  return { apiUrl, token }
}

export function isFootballSiteEnabled() {
  return footballSiteMode === 'enabled'
}

function maybeScheduleFootballSiteRecoveryProbe({ apiUrl, token }) {
  if (siteRecoveryProbeInFlight) return
  const now = Date.now()
  if (now - lastSiteRecoveryProbeAt < getSiteRecoveryProbeMs()) return
  siteRecoveryProbeInFlight = true
  lastSiteRecoveryProbeAt = now

  fetchWithTimeout(`${apiUrl}/api/vk/roster-snapshot`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (response) => {
      if (!response.ok) {
        try {
          await response.text()
        } catch {
          /* ignore */
        }
        return
      }
      try {
        await response.text()
      } catch {
        /* ignore */
      }
      if (footballSiteMode !== 'enabled') {
        footballSiteMode = 'enabled'
        didWarnRuntimeApiFailure = false
        logWarn(`${S}/site-mode`, 'Football API снова доступен. Возобновили интеграцию с сайтом.')
      }
    })
    .catch(() => {
      // Молча: это фоновая проба восстановления, чтобы не шуметь логами.
    })
    .finally(() => {
      siteRecoveryProbeInFlight = false
    })
}

/**
 * Одна проверка Football API при старте бота.
 * После этой проверки режим фиксируется до перезапуска процесса.
 */
export async function initializeFootballSiteMode() {
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN

  if (!apiUrl || !token) {
    footballSiteMode = 'disabled'
    return false
  }

  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/roster-snapshot`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      footballSiteMode = 'disabled'
      logWarn(`${S}/site-mode`, `Football API недоступен на старте (HTTP ${response.status}). Работаем без сайта.`)
      try {
        await response.text()
      } catch {
        /* ignore */
      }
      return false
    }
    footballSiteMode = 'enabled'
    logWarn(`${S}/site-mode`, 'Football API доступен на старте. Работаем с сайтом.')
    try {
      await response.text()
    } catch {
      /* ignore */
    }
    return true
  } catch (err) {
    footballSiteMode = 'disabled'
    const reason = isTimeoutError(err) ? 'timeout' : err instanceof Error ? err.message : String(err)
    logWarn(`${S}/site-mode`, `Football API недоступен на старте (${reason}). Работаем без сайта.`)
    return false
  }
}

function logFootballApiError(scope, err, meta) {
  if (isNetworkFetchFailure(err) || isTimeoutError(err)) {
    footballSiteMode = 'disabled'
    if (!didWarnRuntimeApiFailure) {
      didWarnRuntimeApiFailure = true
      logWarn(
        `${S}/site-mode`,
        'Football API перестал отвечать после старта. До перезапуска работаем без интеграции с сайтом.',
      )
    }
    return
  }
  logError(scope, err, meta)
}

function getDbConfig() {
  const host = process.env.DB_HOST
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME
  const port = Number(process.env.DB_PORT || process.env.FOOTBALL_DB_PORT || 3306)

  if (!host || !user || !database) {
    if (!didWarnDbConfigMissing) {
      didWarnDbConfigMissing = true
      logWarn(`${S}/db-config`, 'DB_HOST/DB_USER/DB_NAME не заданы. Фолбек рейтинга в БД отключён.')
    }
    return null
  }

  return {
    host,
    user,
    password,
    database,
    port: Number.isFinite(port) && port > 0 ? port : 3306,
  }
}

function getDbPool() {
  if (dbPool) return dbPool
  const cfg = getDbConfig()
  if (!cfg) return null

  dbPool = mysql.createPool({
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    port: cfg.port,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
  })

  return dbPool
}

function getRatingsCacheTtlMs() {
  const ttl = Number(process.env.FOOTBALL_RATINGS_CACHE_TTL_MS || 20_000)
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 20_000
}

function getRatingsCacheMaxSize() {
  const max = Number(process.env.FOOTBALL_RATINGS_CACHE_MAX_SIZE || 5000)
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 5000
}

/** @type {Map<number, { rating: number, label: string, expiresAt: number }>} */
const ratingsCacheByVkId = new Map()

function buildEmptyRatingsPack() {
  return { ratings: new Map(), siteDisplayByVkId: new Map() }
}

function mergeRatingsPacks(base, extra) {
  const mergedRatings = new Map(base.ratings)
  for (const [vkUserId, rating] of extra.ratings) {
    mergedRatings.set(vkUserId, rating)
  }
  const mergedDisplay = new Map(base.siteDisplayByVkId)
  for (const [vkUserId, label] of extra.siteDisplayByVkId) {
    mergedDisplay.set(vkUserId, label)
  }
  return { ratings: mergedRatings, siteDisplayByVkId: mergedDisplay }
}

function cleanupRatingsCache(now = Date.now()) {
  for (const [vkUserId, cached] of ratingsCacheByVkId) {
    if (cached.expiresAt <= now) {
      ratingsCacheByVkId.delete(vkUserId)
    }
  }

  const maxSize = getRatingsCacheMaxSize()
  if (ratingsCacheByVkId.size <= maxSize) return

  const overflow = ratingsCacheByVkId.size - maxSize
  const oldestFirst = Array.from(ratingsCacheByVkId.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .slice(0, overflow)

  for (const [vkUserId] of oldestFirst) {
    ratingsCacheByVkId.delete(vkUserId)
  }
}

function readFreshRatingsFromCache(uniqueIds) {
  const now = Date.now()
  cleanupRatingsCache(now)
  const cachedIds = new Set()
  const pack = buildEmptyRatingsPack()

  for (const vkUserId of uniqueIds) {
    const cached = ratingsCacheByVkId.get(vkUserId)
    if (!cached) continue
    if (cached.expiresAt <= now) {
      ratingsCacheByVkId.delete(vkUserId)
      continue
    }
    cachedIds.add(vkUserId)
    pack.ratings.set(vkUserId, cached.rating)
    if (cached.label) {
      pack.siteDisplayByVkId.set(vkUserId, cached.label)
    }
  }

  return { pack, cachedIds }
}

function writeRatingsToCache(pack) {
  const expiresAt = Date.now() + getRatingsCacheTtlMs()
  for (const [vkUserId, rating] of pack.ratings) {
    const label = pack.siteDisplayByVkId.get(vkUserId) || ''
    ratingsCacheByVkId.set(vkUserId, { rating, label, expiresAt })
  }
  cleanupRatingsCache()
}

/** Значения username из БД, которые не показываем — берём name. */
const INVALID_DB_USERNAMES = new Set([
  'unknown',
  'undefined',
  'null',
  'none',
  'anonymous',
  'n/a',
  'na',
  '-',
  '—',
  'user',
  'ник',
  'нет',
])

function normalizeDbUsernameForCheck(username) {
  return String(username)
    .trim()
    .replace(/^@+/u, '')
    .trim()
    .toLowerCase()
}

function isInvalidDbUsername(username) {
  if (username == null) return true
  const n = normalizeDbUsernameForCheck(username)
  if (!n) return true
  return INVALID_DB_USERNAMES.has(n)
}

/** Подпись в списке ВК: username из БД сайта (если не плейсхолдер), иначе name. */
function buildSiteListLabel(username, name) {
  const u = username != null && String(username).trim() !== '' ? String(username).trim() : ''
  if (u && !isInvalidDbUsername(u)) return u
  const n = name != null && String(name).trim() !== '' ? String(name).trim() : ''
  return n
}

function mapRatingsRows(rows) {
  const ratings = new Map()
  const siteDisplayByVkId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const vkUserId = Number(row?.vk_user_id)
    if (!Number.isFinite(vkUserId) || vkUserId === 0) continue
    ratings.set(vkUserId, Number(row?.rating) || 0)
    const label = buildSiteListLabel(row?.username, row?.name)
    if (label) siteDisplayByVkId.set(vkUserId, label)
  }
  return { ratings, siteDisplayByVkId }
}

/**
 * Регистрирует пользователя ВК на игру в football-проекте.
 * Если игрока нет — создаёт нового с именем из ВК-профиля.
 * Если endpoint недоступен — тихо пропускаем, бот продолжает работу.
 *
 * @param {object} params
 * @param {number} params.vkUserId - Id пользователя в ВКонтакте
 * @param {string} params.firstName - Имя пользователя из ВК
 * @param {string} params.lastName - Фамилия пользователя из ВК
 */
export async function registerPlayerOnFootballSite({ vkUserId, firstName, lastName }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth

  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': buildApiIdempotencyKey('join', vkUserId),
      },
      body: JSON.stringify({ vk_user_id: vkUserId, first_name: firstName, last_name: lastName }),
    })
    if (!response.ok) {
      if (response.status === 409) {
        try {
          await response.text()
        } catch {
          /* ignore */
        }
        return { ok: false, tournamentLive: true }
      }
      await logHttpNotOk(S, response, 'POST /api/vk/join')
      return null
    }

    const data = await response.json()
    return data
  } catch (err) {
    logFootballApiError(`${S}/join`, err, { vkUserId })
    return null
  }
}

/**
 * Убирает пользователя ВК из списка выбранных игроков турнира.
 *
 * @param {object} params
 * @param {number} params.vkUserId - Id пользователя в ВКонтакте
 */
export async function removePlayerFromFootballSite({ vkUserId }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth

  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': buildApiIdempotencyKey('leave', vkUserId),
      },
      body: JSON.stringify({ vk_user_id: vkUserId }),
    })
    if (!response.ok) {
      if (response.status === 409) {
        try {
          await response.text()
        } catch {
          /* ignore */
        }
        return { ok: false, tournamentLive: true }
      }
      await logHttpNotOk(S, response, 'POST /api/vk/leave')
      return null
    }

    const data = await response.json()
    return data
  } catch (err) {
    logFootballApiError(`${S}/leave`, err, { vkUserId })
    return null
  }
}

const vkJsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

/**
 * После старта списка в чате — сохраняем связь на сайте (без этого сайт→ВК не синкается).
 * @param {{ peerId: number, gameEventId: string }} params
 */
export async function registerVkListLinkOnFootballSite({ peerId, gameEventId }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/link-event`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({ peer_id: peerId, game_event_id: gameEventId }),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/link-event')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/link-event`, err, { peerId, gameEventId })
    return null
  }
}

/** Закрыли событие в боте — убираем связь, чтобы сайт не менял чужие чаты. */
export async function unregisterVkListLinkOnFootballSite() {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/unlink-event`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/unlink-event')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/unlink-event`, err)
    return null
  }
}

/**
 * Создать игрока на сайте с отрицательным vk_user_id (команда +add в боте).
 * @param {{ name: string }} params
 */
export async function createSyntheticPlayerOnFootballSite({ name }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/create-synthetic-player`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/create-synthetic-player')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/create-synthetic-player`, err, { name })
    return null
  }
}

/**
 * Снимок selectedIds с сайта в виде vk id (только если ранее вызвали link-event).
 * @returns {Promise<null | { linked: false, closeVkListRequested?: boolean } | { linked: true, peerId: number, gameEventId: string, rosterVkUserIds: number[], closeVkListRequested?: boolean, matchStatus?: string, liveHomeTeam?: string, liveAwayTeam?: string }>}
 */
export async function fetchFootballSiteRosterSnapshot() {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/roster-snapshot`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'GET /api/vk/roster-snapshot')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/roster-snapshot`, err)
    return null
  }
}

/**
 * Рейтинги и подписи из БД сайта (username, name) по vk_user_id.
 * @param {{ vkUserIds: number[] }} params
 * @returns {Promise<{ ratings: Map<number, number>, siteDisplayByVkId: Map<number, string> } | null>}
 */
export async function fetchVkRatingsOnFootballSite({ vkUserIds }) {
  const uniqueIds = Array.from(
    new Set((Array.isArray(vkUserIds) ? vkUserIds : []).filter((id) => Number.isFinite(id) && id !== 0)),
  ).slice(0, 200)

  if (!uniqueIds.length) return buildEmptyRatingsPack()

  const { pack: cachedPack, cachedIds } = readFreshRatingsFromCache(uniqueIds)
  const missingIds = uniqueIds.filter((id) => !cachedIds.has(id))
  if (!missingIds.length) return cachedPack

  const apiRatings = await fetchVkRatingsViaApi({ uniqueIds: missingIds })
  if (apiRatings) {
    writeRatingsToCache(apiRatings)
    return mergeRatingsPacks(cachedPack, apiRatings)
  }

  const dbRatings = await fetchVkRatingsViaDb({ uniqueIds: missingIds })
  if (dbRatings) {
    writeRatingsToCache(dbRatings)
    return mergeRatingsPacks(cachedPack, dbRatings)
  }

  // Если источник временно недоступен, отдаем хотя бы свежие кэшированные данные.
  return cachedIds.size ? cachedPack : null
}

async function fetchVkRatingsViaApi({ uniqueIds }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth

  try {
    const query = encodeURIComponent(uniqueIds.join(','))
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/ratings?vk_user_ids=${query}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'GET /api/vk/ratings')
      return null
    }

    const payload = await response.json()
    const mapped = mapRatingsRows(payload?.ratings)
    return mapped
  } catch (err) {
    logFootballApiError(`${S}/ratings`, err, { count: uniqueIds.length })
    return null
  }
}

async function fetchVkRatingsViaDb({ uniqueIds }) {
  const pool = getDbPool()
  if (!pool) return null

  try {
    const placeholders = uniqueIds.map(() => '?').join(',')
    const sql = `SELECT vk_user_id, rating, name, username FROM players WHERE vk_user_id IN (${placeholders})`
    const [rows] = await pool.query(sql, uniqueIds)
    const mapped = mapRatingsRows(rows)
    return mapped
  } catch (err) {
    logFootballApiError(`${S}/ratings-db`, err, { count: uniqueIds.length })
    return null
  }
}

/** Сбросить флаг «закрыть список» после runCloseEvent (или noop). */
export async function ackVkListCloseRequest() {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/close-list-ack`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/close-list-ack')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/close-list-ack`, err)
    return null
  }
}
