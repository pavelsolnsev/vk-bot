import { sendPrivateMessage } from '../vk/sendPrivateMessage.js'

export async function notifyPromotedToMain(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await Promise.all(uniq.map((id) => sendPrivateMessage(vk, id, '🎉 Вы в основном составе!')))
}

export async function notifyMovedToQueue(vk, userIds) {
  const uniq = [...new Set(userIds)].filter((id) => typeof id === 'number' && id > 0)
  await Promise.all(uniq.map((id) => sendPrivateMessage(vk, id, '⚠️ Вы перемещены в очередь.')))
}

export async function notifyJoinedQueue(vk, userId) {
  if (typeof userId !== 'number' || userId <= 0) return
  await sendPrivateMessage(vk, userId, '📢 Вы записаны в очередь.')
}

