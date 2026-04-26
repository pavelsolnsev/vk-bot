import { logHttpNotOk } from '../../utils/botLog.js'
import { FOOTBALL_API_SCOPE } from './constants.js'
import { buildApiIdempotencyKey, fetchWithTimeout, nextFootballRequestNonce } from './httpClient.js'
import { invalidateRatingsCacheForVkUserIds } from './ratings.js'
import { getFootballApiAuth, logFootballApiError } from './siteMode.js'

const S = FOOTBALL_API_SCOPE

const vkJsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

/**
 * Регистрирует пользователя ВК на игру в football-проекте.
 * Если игрока нет — создаёт нового с именем из ВК-профиля.
 * Если endpoint недоступен — тихо пропускаем, бот продолжает работу.
 *
 * @param {object} params
 * @param {number} params.vkUserId - Id пользователя в ВКонтакте
 * @param {string} params.firstName - Имя пользователя из ВК
 * @param {string} params.lastName - Фамилия пользователя из ВК
 * @param {string} [params.team] - Команда с кнопки (турнир с teamSlots)
 * @param {string|number} [params.joinRequestId] — уникален на каждый join после выхода, иначе кэш idempotency на сервере может отдать старый ответ без повторной записи в БД.
 */
export async function registerPlayerOnFootballSite({ vkUserId, firstName, lastName, team, joinRequestId }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth

  try {
    const teamPayload = typeof team === 'string' && team.trim() ? team.trim() : undefined
    const body = { vk_user_id: vkUserId, first_name: firstName, last_name: lastName }
    if (teamPayload) {
      body.team = teamPayload
    }
    const idemExtra = [teamPayload ?? '', joinRequestId != null ? String(joinRequestId) : String(Date.now())]
      .filter((s) => s.length > 0)
      .join('\u0001')
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': buildApiIdempotencyKey('join', vkUserId, idemExtra),
      },
      body: JSON.stringify(body),
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
    invalidateRatingsCacheForVkUserIds([vkUserId])
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
        'X-Idempotency-Key': buildApiIdempotencyKey('leave', vkUserId, nextFootballRequestNonce()),
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
    invalidateRatingsCacheForVkUserIds([vkUserId])
    return data
  } catch (err) {
    logFootballApiError(`${S}/leave`, err, { vkUserId })
    return null
  }
}

/**
 * Смена команды на сайте (команда mvteam в боте).
 * @param {{ vkUserId: number, team: string | null | undefined }} params — null/undefined = без команды
 */
export async function setPlayerTeamOnFootballSite({ vkUserId, team }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  const teamPayload = typeof team === 'string' && team.trim() ? team.trim() : null
  const body = { vk_user_id: vkUserId }
  if (teamPayload) {
    body.team = teamPayload
  }
  try {
    const idemExtra = [teamPayload ?? '', nextFootballRequestNonce()].filter((s) => s.length > 0).join('\u0001')
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/set-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': buildApiIdempotencyKey('set-team', vkUserId, idemExtra),
      },
      body: JSON.stringify(body),
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
      await logHttpNotOk(S, response, 'POST /api/vk/set-team')
      return null
    }

    const data = await response.json()
    invalidateRatingsCacheForVkUserIds([vkUserId])
    return data
  } catch (err) {
    logFootballApiError(`${S}/set-team`, err, { vkUserId })
    return null
  }
}

/**
 * После старта списка в чате — сохраняем связь на сайте (без этого сайт→ВК не синкается).
 * @param {{ peerId: number, gameEventId: string, teamSlots?: string[], vkListTournament: boolean }} params — vkListTournament: true только для s tr (place === 'tr').
 */
export async function registerVkListLinkOnFootballSite({ peerId, gameEventId, teamSlots, vkListTournament }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const body = {
      peer_id: peerId,
      game_event_id: gameEventId,
      vk_list_tournament: vkListTournament === true,
    }
    // Массив (в т.ч. пустой) — полная пересинхронизация списка кнопок с бота; undefined/null — не трогаем vkTeamSlots на сервере.
    if (Array.isArray(teamSlots)) {
      body.team_slots = teamSlots
    }
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/link-event`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify(body),
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

/**
 * Сброс данных турнира на сайте (как кнопка «Очистить данные»). Вызывается при e! вместе с unlink.
 * @returns {Promise<object|null>}
 */
export async function clearTournamentDataOnFootballSite() {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/clear-tournament`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/clear-tournament')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/clear-tournament`, err)
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
 * Синхронизация отметки оплаты с сайтом (после p / unp в чате).
 * @param {{ vkUserId: number, paid: boolean }} params
 */
export async function setPlayerPaidOnFootballSite({ vkUserId, paid }) {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/player-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': buildApiIdempotencyKey('player-paid', vkUserId, `${paid ? 1 : 0}\u0001${nextFootballRequestNonce()}`),
      },
      body: JSON.stringify({ vk_user_id: vkUserId, paid }),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/player-paid')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/player-paid`, err, { vkUserId, paid })
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

/** Сбросить запрос «создать список» после выполнения (или noop). */
export async function ackVkStartRequest() {
  const auth = getFootballApiAuth()
  if (!auth) return null
  const { apiUrl, token } = auth
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/vk/start-request-ack`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      await logHttpNotOk(S, response, 'POST /api/vk/start-request-ack')
      return null
    }
    return await response.json()
  } catch (err) {
    logFootballApiError(`${S}/start-request-ack`, err)
    return null
  }
}
