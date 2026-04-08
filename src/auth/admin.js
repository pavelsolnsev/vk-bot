const ADMIN_IDS = String(process.env.VK_ADMIN_IDS || '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

/** Список user_id админов для ЛС-уведомлений (копия массива). */
export function getAdminVkIds() {
  return ADMIN_IDS.slice()
}

export function isAdmin(senderId) {
  if (ADMIN_IDS.length === 0) return false
  return ADMIN_IDS.includes(senderId)
}

