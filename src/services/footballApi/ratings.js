import mysql from 'mysql2/promise'
import { logHttpNotOk, logWarn } from '../../utils/botLog.js'
import { FOOTBALL_API_SCOPE } from './constants.js'
import { fetchWithTimeout } from './httpClient.js'
import { getFootballApiAuth, logFootballApiError } from './siteMode.js'

const S = FOOTBALL_API_SCOPE

let didWarnDbConfigMissing = false
let dbPool = null

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

/** @type {Map<number, { rating: number, label: string, listLabelFromDbName: boolean, expiresAt: number }>} */
const ratingsCacheByVkId = new Map()

function buildEmptyRatingsPack() {
  return {
    ratings: new Map(),
    siteDisplayByVkId: new Map(),
    listLabelFromDbNameByVkId: new Map(),
  }
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
  const mergedFromName = new Map(base.listLabelFromDbNameByVkId ?? new Map())
  const extraFromName = extra.listLabelFromDbNameByVkId ?? new Map()
  for (const [vkUserId, v] of extraFromName) {
    mergedFromName.set(vkUserId, v)
  }
  return {
    ratings: mergedRatings,
    siteDisplayByVkId: mergedDisplay,
    listLabelFromDbNameByVkId: mergedFromName,
  }
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
      if (cached.listLabelFromDbName === true) {
        pack.listLabelFromDbNameByVkId.set(vkUserId, true)
      }
    }
  }

  return { pack, cachedIds }
}

function writeRatingsToCache(pack) {
  const expiresAt = Date.now() + getRatingsCacheTtlMs()
  for (const [vkUserId, rating] of pack.ratings) {
    const label = pack.siteDisplayByVkId.get(vkUserId) || ''
    const listLabelFromDbName = pack.listLabelFromDbNameByVkId?.get(vkUserId) === true
    ratingsCacheByVkId.set(vkUserId, { rating, label, listLabelFromDbName, expiresAt })
  }
  cleanupRatingsCache()
}

/** Сброс кэша подписи/рейтинга по vk id (после правок игрока в БД на сайте, join/leave). */
export function invalidateRatingsCacheForVkUserIds(userIds) {
  for (const id of Array.isArray(userIds) ? userIds : []) {
    if (typeof id === 'number' && Number.isFinite(id) && id !== 0) ratingsCacheByVkId.delete(id)
  }
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

/**
 * Подпись в списке ВК: username из БД (если не плейсхолдер), иначе name.
 * listLabelFromDbName — подпись взята из поля name (username пустой или мусор вроде @unknown).
 * @returns {{ label: string, listLabelFromDbName: boolean }}
 */
function buildSiteListLabel(username, name) {
  const n = name != null && String(name).trim() !== '' ? String(name).trim() : ''
  const u = username != null && String(username).trim() !== '' ? String(username).trim() : ''
  if (u && !isInvalidDbUsername(u)) {
    return { label: u, listLabelFromDbName: false }
  }
  return { label: n, listLabelFromDbName: Boolean(n) }
}

function mapRatingsRows(rows) {
  const ratings = new Map()
  const siteDisplayByVkId = new Map()
  const listLabelFromDbNameByVkId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const vkUserId = Number(row?.vk_user_id)
    if (!Number.isFinite(vkUserId) || vkUserId === 0) continue
    ratings.set(vkUserId, Number(row?.rating) || 0)
    const { label, listLabelFromDbName } = buildSiteListLabel(row?.username, row?.name)
    if (label) {
      siteDisplayByVkId.set(vkUserId, label)
      if (listLabelFromDbName) listLabelFromDbNameByVkId.set(vkUserId, true)
    }
  }
  return { ratings, siteDisplayByVkId, listLabelFromDbNameByVkId }
}

/** Есть строка рейтинга по каждому из запрошенных vk id (иначе фолбэк на API). */
function isRatingsPackCompleteForIds(pack, ids) {
  if (!pack?.ratings || !Array.isArray(ids) || !ids.length) return false
  return ids.every((id) => pack.ratings.has(id))
}

async function fetchVkRatingsViaApi({ uniqueIds, bustHttpCache = false }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth

  try {
    const query = encodeURIComponent(uniqueIds.join(','))
    const bust = bustHttpCache ? `&_=${Date.now()}` : ''
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/ratings?vk_user_ids=${query}${bust}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(bustHttpCache ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
      },
      ...(bustHttpCache ? { cache: 'no-store' } : {}),
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

/**
 * Рейтинги и подписи из БД сайта (username, name) по vk_user_id.
 * Кэш по умолчанию см. FOOTBALL_RATINGS_CACHE_TTL_MS — после ручных правок в БД данные подтянутся после TTL,
 * либо сразу после join/leave (инвалидация), либо при bypassCache (например админское ЛС).
 * @param {{ vkUserIds: number[], bypassCache?: boolean }} params
 * @returns {Promise<{ ratings: Map<number, number>, siteDisplayByVkId: Map<number, string>, listLabelFromDbNameByVkId: Map<number, boolean> } | null>}
 */
export async function fetchVkRatingsOnFootballSite({ vkUserIds, bypassCache = false }) {
  const uniqueIds = Array.from(
    new Set((Array.isArray(vkUserIds) ? vkUserIds : []).filter((id) => Number.isFinite(id) && id !== 0)),
  ).slice(0, 200)

  if (!uniqueIds.length) return buildEmptyRatingsPack()

  const { pack: cachedPack, cachedIds } = bypassCache
    ? { pack: buildEmptyRatingsPack(), cachedIds: new Set() }
    : readFreshRatingsFromCache(uniqueIds)
  const missingIds = uniqueIds.filter((id) => !cachedIds.has(id))
  if (!missingIds.length) return cachedPack

  let fetched = null
  if (bypassCache) {
    invalidateRatingsCacheForVkUserIds(missingIds)
    if (getDbPool()) {
      const fromDb = await fetchVkRatingsViaDb({ uniqueIds: missingIds })
      if (isRatingsPackCompleteForIds(fromDb, missingIds)) fetched = fromDb
    }
    if (!fetched) {
      fetched = await fetchVkRatingsViaApi({ uniqueIds: missingIds, bustHttpCache: true })
    }
  } else {
    fetched =
      (await fetchVkRatingsViaApi({ uniqueIds: missingIds })) ||
      (await fetchVkRatingsViaDb({ uniqueIds: missingIds }))
  }

  if (fetched) {
    writeRatingsToCache(fetched)
    return mergeRatingsPacks(cachedPack, fetched)
  }

  // Если источник временно недоступен, отдаем хотя бы свежие кэшированные данные.
  return cachedIds.size ? cachedPack : null
}
