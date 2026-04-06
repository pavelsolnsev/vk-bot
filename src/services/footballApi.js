// Сервис для связи с football-сайтом.
// Вызывается когда пользователь нажимает «Играть» или «Выйти» — регистрирует или убирает его из проекта.

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
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN

  // Если переменные не настроены — пропускаем без ошибки.
  if (!apiUrl || !token) {
    return null
  }

  try {
    const response = await fetch(`${apiUrl}/api/vk/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Передаём секретный токен — сервер проверяет что запрос от бота.
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ vk_user_id: vkUserId, first_name: firstName, last_name: lastName }),
    })

    if (!response.ok) {
      // 409 — турнир в live, сайт не принимает запись в список (см. football join.post).
      if (response.status === 409) {
        await response.text().catch(() => {})
        return { ok: false, tournamentLive: true }
      }
      await response.text().catch(() => {})
      return null
    }

    // Возвращаем данные созданного игрока — { ok, player: { id, name } }.
    const data = await response.json()
    return data
  } catch {
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
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN

  // Если переменные не настроены — пропускаем без ошибки.
  if (!apiUrl || !token) {
    return null
  }

  try {
    const response = await fetch(`${apiUrl}/api/vk/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ vk_user_id: vkUserId }),
    })

    if (!response.ok) {
      // 409 — турнир в live, снятие с турнира на сайте закрыто (см. football leave.post).
      if (response.status === 409) {
        await response.text().catch(() => {})
        return { ok: false, tournamentLive: true }
      }
      await response.text().catch(() => {})
      return null
    }

    const data = await response.json()
    return data
  } catch {
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
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN
  if (!apiUrl || !token) return null
  try {
    const response = await fetch(`${apiUrl}/api/vk/link-event`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({ peer_id: peerId, game_event_id: gameEventId }),
    })
    if (!response.ok) {
      await response.text().catch(() => {})
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

/** Закрыли событие в боте — убираем связь, чтобы сайт не менял чужие чаты. */
export async function unregisterVkListLinkOnFootballSite() {
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN
  if (!apiUrl || !token) return null
  try {
    const response = await fetch(`${apiUrl}/api/vk/unlink-event`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      await response.text().catch(() => {})
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Создать игрока на сайте с отрицательным vk_user_id (команда +add в боте).
 * @param {{ name: string }} params
 */
export async function createSyntheticPlayerOnFootballSite({ name }) {
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN
  if (!apiUrl || !token) return null
  try {
    const response = await fetch(`${apiUrl}/api/vk/create-synthetic-player`, {
      method: 'POST',
      headers: vkJsonHeaders(token),
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      await response.text().catch(() => {})
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Снимок selectedIds с сайта в виде vk id (только если ранее вызвали link-event).
 * @returns {Promise<{ linked: false } | { linked: true, peerId: number, gameEventId: string, rosterVkUserIds: number[] } | null>}
 */
export async function fetchFootballSiteRosterSnapshot() {
  const apiUrl = process.env.FOOTBALL_API_URL
  const token = process.env.FOOTBALL_TOKEN
  if (!apiUrl || !token) return null
  try {
    const response = await fetch(`${apiUrl}/api/vk/roster-snapshot`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      await response.text().catch(() => {})
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}
