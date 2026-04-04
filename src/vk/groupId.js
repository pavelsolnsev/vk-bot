/** ID сообщества (положительный) для вызовов API от имени сообщества, например messages.edit */
export function resolveGroupIdForApi(vk) {
  const raw = process.env.VK_GROUP_ID
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  const polled = vk?.updates?.options?.pollingGroupId
  if (polled != null && Number.isFinite(polled) && polled > 0) return polled
  return undefined
}
