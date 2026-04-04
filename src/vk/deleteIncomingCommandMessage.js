/**
 * Удаляет сообщение с командой, чтобы не засорять чат.
 * Требует, чтобы у сообщества были права на удаление сообщений в беседе.
 */
export async function deleteIncomingCommandMessage(context) {
  try {
    await context.deleteMessage({ delete_for_all: 1 })
  } catch {
    // может быть запрещено правами/настройками чата
  }
}

