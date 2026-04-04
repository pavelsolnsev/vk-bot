const ADMIN_IDS = String(process.env.VK_ADMIN_IDS || '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

export function isAdmin(senderId) {
  if (ADMIN_IDS.length === 0) return false
  return ADMIN_IDS.includes(senderId)
}

