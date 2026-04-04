/**
 * Отправить сообщение и удалить его через delayMs.
 * Используется для кратких уведомлений (например, "нет прав").
 */
export async function sendEphemeral(context, text, delayMs = 3000) {
  const sent = await context.send(text)

  // vk-io возвращает MessageContext с deleteMessage()
  setTimeout(() => {
    try {
      Promise.resolve(sent?.deleteMessage?.({ delete_for_all: 1 })).catch(() => {})
    } catch {
      // ignore
    }
  }, delayMs)
}

