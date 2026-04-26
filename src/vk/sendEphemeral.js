import { sendEphemeralPeer } from './sendEphemeralPeer.js'

/**
 * Краткое уведомление в текущем peer (после message_new и т.п.).
 * @param {import('vk-io').VK} vk
 * @param {import('vk-io').MessageContext} context
 */
export async function sendEphemeral(vk, context, text, delayMs = 3000) {
  await sendEphemeralPeer(vk, context.peerId, text, delayMs)
}
