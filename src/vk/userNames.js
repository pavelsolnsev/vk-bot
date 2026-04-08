/** Фолбек, если в БД сайта нет строки игрока: имя из профиля ВК. */
export async function resolveUserNames(vk, cache, userIds) {
  const uniqPositive = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  const missing = uniqPositive.filter((id) => !cache.has(id))

  if (missing.length) {
    const users = await vk.api.users.get({ user_ids: missing })
    for (const u of users) {
      cache.set(u.id, `${u.first_name} ${u.last_name}`.trim())
    }
  }

  // Важно: возвращаем имена в том же порядке, что и входной массив userIds
  return userIds.map((id) => {
    if (typeof id !== 'number') return 'Unknown'
    const cached = cache.get(id)
    if (cached) return cached
    return id > 0 ? `id${id}` : `Игрок${Math.abs(id)}`
  })
}
