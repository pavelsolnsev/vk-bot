/**
 * Турнирный список в ВК — только пресет `s tr` / `start tr` (place === 'tr').
 * Обычные матчи (s prof, s kz, дата+время+площадка) — плоский список и одна кнопка «Играть», без команд в боте.
 */
export function isVkTournamentTrListEvent(event) {
  return String(event?.place ?? '').trim().toLowerCase() === 'tr'
}

/**
 * Тело team_slots для POST link-event: для не-турнира шлём [] (сброс кнопок команд на сайте);
 * для турнира — массив слотов или undefined (не трогать поле на сервере).
 */
export function vkLinkEventTeamSlotsPayload(event) {
  if (!isVkTournamentTrListEvent(event)) return []
  const s = event?.teamSlots
  return Array.isArray(s) ? s : undefined
}
