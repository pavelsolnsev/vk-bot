import { logError, logWarn } from '../../utils/botLog.js'
import { FOOTBALL_API_SCOPE } from './constants.js'
import { fetchWithTimeout, getSiteRecoveryProbeMs, isNetworkFetchFailure, isTimeoutError } from './httpClient.js'

const S = FOOTBALL_API_SCOPE

let footballSiteMode = 'uninitialized'
let siteRecoveryProbeInFlight = false
let lastSiteRecoveryProbeAt = 0
let didWarnRuntimeApiFailure = false

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

export function getFootballApiAuth() {
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

export function logFootballApiError(scope, err, meta) {
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
