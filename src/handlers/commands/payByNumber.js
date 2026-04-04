import { getUserIdByIndex } from './indexByNumber.js'
import { refreshList } from './context.js'

export async function tryPayByNumber({ vk, store, context, event, text }) {
  const m = text.match(/^p(\d+)$/iu)
  if (!m) return false

  const userId = getUserIdByIndex(event, m[1])
  if (userId == null) return true

  event.paidParticipants.add(userId)
  await refreshList({ vk, store, context, event })
  return true
}

export async function tryUnpayByNumber({ vk, store, context, event, text }) {
  const m = text.match(/^up(\d+)$/iu)
  if (!m) return false

  const userId = getUserIdByIndex(event, m[1])
  if (userId == null) return true

  event.paidParticipants.delete(userId)
  await refreshList({ vk, store, context, event })
  return true
}

