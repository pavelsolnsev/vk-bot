import { Keyboard } from "vk-io";

/** ВК ограничивает длину подписи кнопки — обрезаем по символам, а полное имя оставляем в payload. */
function truncateButtonLabel(text, maxChars = 40) {
  const chars = Array.from(String(text || ""))
  if (chars.length <= maxChars) return chars.join("")
  return `${chars.slice(0, maxChars - 1).join("")}…`
}

/**
 * Callback-кнопки: не создают сообщений в чате при нажатии (в отличие от textButton).
 * Для турнира с заранее заданными командами вместо «Играть» — по кнопке на каждую команду.
 */
export function buildEventKeyboard(event) {
  const eventId = event?.id
  const kb = Keyboard.builder()
    // Без inline VK шлёт событие, на которое messages.sendMessageEventAnswer часто отвечает invalid event_id.
    .inline()

  const teamsRaw = Array.isArray(event?.teamSlots) ? event.teamSlots.filter(Boolean) : []
  // ВК даёт максимум 10 рядов; «Выйти» — отдельный ряд, поэтому показываем не больше 9 команд (старые списки с 10 — обрежем).
  const teams = teamsRaw.slice(0, 9)

  if (teams.length) {
    // Каждая команда — отдельный ряд, чтобы кнопки шли столбиком (как просили в чате).
    for (const teamName of teams) {
      // Текст на кнопке — с префиксом; в payload по-прежнему чистое имя команды для join.
      const labelWithPrefix = `Играть за ${teamName}`
      kb.callbackButton({
        label: truncateButtonLabel(labelWithPrefix),
        payload: { cmd: "join", event_id: eventId, team: teamName },
        color: Keyboard.POSITIVE_COLOR,
      })
      kb.row()
    }
  } else {
    kb.callbackButton({
      label: "Играть",
      payload: { cmd: "join", event_id: eventId },
      color: Keyboard.POSITIVE_COLOR,
    })
    kb.row()
  }

  kb.callbackButton({
    label: "Выйти",
    payload: { cmd: "leave", event_id: eventId },
    color: Keyboard.NEGATIVE_COLOR,
  })

  return kb
}
