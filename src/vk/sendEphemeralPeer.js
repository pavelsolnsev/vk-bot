import { resolveGroupIdForApi } from './groupId.js'

const randomSendId = () => Math.floor(Math.random() * 10000) * Date.now()

/**
 * Короткое сообщение с автоудалением.
 * peerId — id беседы (чат со списком) или id пользователя для ЛС «пользователь ↔ сообщество».
 * show_snackbar из callback на телефонах часто не показывается — этот вызов виден в мобильных клиентах.
 */
export async function sendEphemeralPeer(vk, peerId, text, delayMs = 4000) {
  const pid = Number(peerId)
  if (!Number.isFinite(pid)) return

  const groupId = resolveGroupIdForApi(vk)
  const params = {
    message: String(text ?? ''),
    random_id: randomSendId(),
    dont_parse_links: 1,
  }
  if (groupId != null) {
    params.group_id = groupId
  }
  // Один получатель — всегда peer_id. peer_ids с id пользователя для ЛС от сообщества часто даёт ошибку API;
  // ошибка раньше глоталась в catch → «тишина» и на десктопе.
  params.peer_id = pid

  let messageId = null
  let cmid = null
  try {
    const raw = await vk.api.messages.send(params)
    if (Array.isArray(raw) && raw.length > 0) {
      const item = raw[0]
      if (item && typeof item === 'object') {
        messageId = item.message_id ?? null
        cmid = item.conversation_message_id ?? null
      }
    } else if (typeof raw === 'number') {
      messageId = raw
    }
  } catch {
    return
  }

  if ((messageId == null || messageId <= 0) && (cmid == null || cmid <= 0)) return

  setTimeout(() => {
    const delParams = {
      peer_id: pid,
      delete_for_all: 1,
    }
    if (cmid != null && cmid > 0) {
      delParams.cmids = [cmid]
    } else if (messageId != null && messageId > 0) {
      delParams.message_ids = [messageId]
    } else {
      return
    }
    if (groupId != null) {
      delParams.group_id = groupId
    }
    Promise.resolve(vk.api.messages.delete(delParams)).catch(() => {})
  }, delayMs)
}
