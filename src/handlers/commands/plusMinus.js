import { joinEvent, leaveEvent } from '../../services/roster.js'
import { refreshList } from './context.js'
import { notifyJoinedQueue, notifyPromotedToMain } from '../../services/dmNotifications.js'

export async function tryPlusMinus({ vk, store, context, event, text, senderId }) {
  if (text !== '+' && text !== '-') return false

  if (text === '+') {
    const res = joinEvent(event, senderId)
    if (res?.status === 'queue') {
      await notifyJoinedQueue(vk, senderId)
    }
  }
  if (text === '-') {
    const res = leaveEvent(event, senderId)
    if (res?.promoted?.length) {
      await notifyPromotedToMain(vk, res.promoted)
    }
  }

  await refreshList({ vk, store, context, event })
  return true
}

