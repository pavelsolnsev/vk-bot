import { createHash } from 'node:crypto'
import { FOOTBALL_API_SCOPE } from './constants.js'

function getApiTimeoutMs() {
  const timeout = Number(process.env.FOOTBALL_API_TIMEOUT_MS || 5000)
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 5000
}

function getApiIdempotencyWindowMs() {
  const ms = Number(process.env.FOOTBALL_API_IDEMPOTENCY_WINDOW_MS || 5000)
  return Number.isFinite(ms) && ms > 0 ? ms : 5000
}

/** Соль в X-Idempotency-Key только в ASCII: fetch (undici) не принимает кириллицу в заголовках. */
function idempotencyExtraSlice(extra) {
  if (extra == null || String(extra).trim() === '') return ''
  return `:${createHash('sha256').update(String(extra), 'utf8').digest('base64url').slice(0, 22)}`
}

/**
 * @param {string} action
 * @param {number} vkUserId
 * @param {string} [extra] — соль (например team); в ключ попадает хэш UTF-8, не сырой текст.
 */
export function buildApiIdempotencyKey(action, vkUserId, extra) {
  const bucket = Math.floor(Date.now() / getApiIdempotencyWindowMs())
  const e = idempotencyExtraSlice(extra)
  return `${action}:${vkUserId}${e}:${bucket}`
}

let idemRequestSeq = 0
/** Уникальный хвост в extra для X-Idempotency-Key: иначе кэш на сервере (join/leave/set-team) возвращает старый ответ без БД при повторе в одном 5s bucket. */
export function nextFootballRequestNonce() {
  idemRequestSeq += 1
  return `${Date.now().toString(36)}-${idemRequestSeq}-${Math.random().toString(36).slice(2, 9)}`
}

export function getSiteRecoveryProbeMs() {
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
  const base = `[vk-bot:${FOOTBALL_API_SCOPE}/http]`
  const line = `${base} ${method} ${pathWithQuery} → ${statusText} ${ms}ms`
  if (bodyHint) {
    console.log(line, { body: bodyHint })
  } else {
    console.log(line)
  }
}

export async function fetchWithTimeout(url, init) {
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

export function isNetworkFetchFailure(err) {
  if (!(err instanceof Error)) return false
  if (err.message !== 'fetch failed') return false
  return true
}

export function isTimeoutError(err) {
  return err instanceof Error && err.name === 'AbortError'
}
