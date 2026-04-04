import { Keyboard } from 'vk-io'

/** Callback-кнопки: не создают сообщений в чате при нажатии (в отличие от textButton). */
export function buildEventKeyboard(eventId) {
  return Keyboard.builder()
    // Callback-кнопки поддерживаются у inline-клавиатуры сообщения; без inline VK шлёт
    // событие, на которое messages.sendMessageEventAnswer часто отвечает invalid event_id.
    .inline()
    .callbackButton({
      label: 'Играть',
      // event_id — как в ответе VK (snake_case), плюс читаем eventId в хендлере для старых кнопок
      payload: { cmd: 'join', event_id: eventId },
      color: Keyboard.POSITIVE_COLOR,
    })
    .callbackButton({
      label: 'Выйти',
      payload: { cmd: 'leave', event_id: eventId },
      color: Keyboard.NEGATIVE_COLOR,
    })
}
