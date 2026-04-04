import { resolveGroupIdForApi } from './groupId.js'

const randomId = () => Math.floor(Math.random() * 10000) * Date.now()

/**
 * Отправка сообщения пользователю в ЛС.
 * Может не сработать, если пользователь не открыл ЛС с сообществом.
 * @param {import('vk-io').KeyboardBuilder | string} [options.keyboard]
 */
export async function sendPrivateMessage(vk, userId, message, options = {}) {
  // виртуальные игроки (отрицательные id) или мусор не трогаем
  if (typeof userId !== 'number' || userId <= 0) return null

  const groupId = resolveGroupIdForApi(vk)
  const params = {
    user_id: userId,
    random_id: randomId(),
    message,
  }
  if (groupId != null) params.group_id = groupId

  const { keyboard } = options
  if (keyboard != null) {
    params.keyboard = typeof keyboard === 'string' ? keyboard : keyboard.toString()
  }

  try {
    await vk.api.messages.send(params)
    return true
  } catch {
    // типично: пользователь запретил сообщения/не писал сообществу
    return null
  }
}

