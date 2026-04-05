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
      await response.text().catch(() => {})
      return null
    }

    const data = await response.json()
    return data
  } catch {
    return null
  }
}
