import { findTeamSlotLabel, parseTeamSlotNames } from './startCommand.js'

/**
 * Разбор `+add …`: возвращает сырое тело после команды (дальше режет parseAddByNameBody).
 */
export function matchAddByNameCommand(text) {
  const m = String(text || '').match(/^\+add\s+(.+)$/iu)
  if (!m) return null
  return { body: m[1] }
}

/**
 * Разбор `+team …`: список команд через parseTeamSlotNames (как в обработчике).
 */
export function matchTeamSlotCommand(text) {
  const m = String(text || '').match(/^\+team\s+(.+)$/iu)
  if (!m) return null
  return { teamNames: parseTeamSlotNames(m[1]) }
}

/**
 * Разбор удаления команды из списка кнопок.
 * Поддерживаем два синтаксиса:
 * - `-team Команда`
 * - `+teamdel Команда`
 */
export function matchRemoveTeamSlotCommand(text) {
  const t = String(text || '').trim()
  const m1 = t.match(/^-team\s+(.+)$/iu)
  if (m1) return { teamRaw: m1[1] }
  const m2 = t.match(/^\+teamdel\s+(.+)$/iu)
  if (m2) return { teamRaw: m2[1] }
  return null
}

/**
 * Перенос игрока между командами (меняем только метку команды):
 * - `mvteam <откуда> <номер> <куда>` — в основном составе
 * - `mvteamq <откуда> <номер> <куда>` — в очереди
 */
export function matchMovePlayerTeamCommand(text) {
  const t = String(text || '').trim()

  const mMain = t.match(/^mvteam\s+(.+)\s+(\d+)\s+(.+)$/iu)
  if (mMain) return { where: 'main', fromTeamRaw: mMain[1], number: mMain[2], toTeamRaw: mMain[3] }

  const mQueue = t.match(/^mvteamq\s+(.+)\s+(\d+)\s+(.+)$/iu)
  if (mQueue) return { where: 'queue', fromTeamRaw: mQueue[1], number: mQueue[2], toTeamRaw: mQueue[3] }

  return null
}

/**
 * Разбор `p3` или `p Команда 2` — то же, что в payByNumber.js.
 */
export function parsePayRosterCommand(text) {
  const t = String(text || '').trim()
  const g = /^p(\d+)$/iu.exec(t)
  if (g) return { mode: 'global', number: g[1] }
  const team = /^p\s+(.+)\s+(\d+)$/iu.exec(t)
  if (team) return { mode: 'team', teamRaw: team[1].trim(), number: team[2] }
  return null
}

/** Разбор `up3` или `up Команда 2`. */
export function parseUnpayRosterCommand(text) {
  const t = String(text || '').trim()
  const g = /^up(\d+)$/iu.exec(t)
  if (g) return { mode: 'global', number: g[1] }
  const team = /^up\s+(.+)\s+(\d+)$/iu.exec(t)
  if (team) return { mode: 'team', teamRaw: team[1].trim(), number: team[2] }
  return null
}

/** Разбор `r3` или `r Команда 2`. */
export function parseRemoveRosterCommand(text) {
  const t = String(text || '').trim()
  const g = /^r(\d+)$/iu.exec(t)
  if (g) return { mode: 'global', number: g[1] }
  const team = /^r\s+(.+)\s+(\d+)$/iu.exec(t)
  if (team) return { mode: 'team', teamRaw: team[1].trim(), number: team[2] }
  return null
}

/**
 * Разбор тела `+add` на имя и команду — та же логика, что была в addByName.js.
 */
export function parseAddByNameBody(body, teamSlots) {
  const trimmed = String(body || '').trim()
  if (!trimmed) return { playerName: '' }

  const slots = Array.isArray(teamSlots) && teamSlots.length ? teamSlots : null
  if (!slots) return { playerName: trimmed }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2) return { playerName: trimmed }

  for (let k = words.length - 1; k >= 1; k -= 1) {
    const candidateTeam = words.slice(k).join(' ')
    const matchedTeam = findTeamSlotLabel(slots, candidateTeam)
    if (!matchedTeam) continue
    const playerName = words.slice(0, k).join(' ').trim()
    if (!playerName) continue
    return { playerName, team: matchedTeam }
  }

  return { playerName: trimmed }
}
