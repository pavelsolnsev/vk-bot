import { parseTeamSlotNames, findTeamSlotLabel } from '../src/parsers/startCommand.js'
import { getUserIdByTeamIndex } from '../src/handlers/commands/indexByNumber.js'
import { joinEvent } from '../src/services/roster.js'

function assertEqual(actual, expected, title) {
  if (actual !== expected) {
    throw new Error(`${title}: expected=${String(expected)} actual=${String(actual)}`)
  }
}

function assertDeepEqual(actual, expected, title) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${title}: expected=${e} actual=${a}`)
  }
}

function runParseTests() {
  const parsed = parseTeamSlotNames(' Красные,  Синие  , красные, ОченьОченьОченьОченьОченьОченьОченьОченьОченьДлинное ')
  assertDeepEqual(
    parsed,
    ['Красные', 'Синие', 'ОченьОченьОченьОченьОченьОченьОченьОчень'],
    'parseTeamSlotNames нормализует и режет команды',
  )

  const withSpaces = parseTeamSlotNames('A   B   C')
  assertDeepEqual(withSpaces, ['A', 'B', 'C'], 'parseTeamSlotNames делит по пробелам')

  const limit = parseTeamSlotNames('t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11')
  assertEqual(limit.length, 9, 'parseTeamSlotNames ограничивает 9 команд')

  assertEqual(findTeamSlotLabel(parsed, '   сИниЕ  '), 'Синие', 'findTeamSlotLabel ищет без регистра')
}

function runIndexTests() {
  const event = {
    teamSlots: ['Красные', 'Синие'],
    participantsOrder: [11, 22, 33, 44, 55],
    participantTeamByVkId: new Map([
      [11, 'красные'],
      [22, 'Красные'],
      [33, 'Синие'],
      [44, 'weird-label'],
    ]),
  }

  assertEqual(getUserIdByTeamIndex(event, 'КРАСНЫЕ', 1), 11, 'индекс внутри команды #1')
  assertEqual(getUserIdByTeamIndex(event, 'красные', 2), 22, 'индекс внутри команды #2')
  assertEqual(getUserIdByTeamIndex(event, 'синие', 1), 33, 'индекс внутри второй команды')
  assertEqual(getUserIdByTeamIndex(event, 'без команды', 1), 44, 'без команды включает невалидную метку')
  assertEqual(getUserIdByTeamIndex(event, 'без команды', 2), 55, 'без команды включает пустую метку')
  assertEqual(getUserIdByTeamIndex(event, 'no', 2), 55, 'алиас no работает')
  assertEqual(getUserIdByTeamIndex(event, 'зелёные', 1), null, 'неизвестная команда возвращает null')
}

function runJoinTests() {
  const event = {
    maxPlayers: 2,
    teamSlots: ['Красные', 'Синие'],
    participants: new Set(),
    participantsOrder: [],
    queue: new Set(),
    queueOrder: [],
    paidParticipants: new Set(),
    participantTeamByVkId: new Map(),
    siteSyncGraceUntilByVkId: new Map(),
  }

  joinEvent(event, 101, { team: '  кРАСНЫЕ ' })
  joinEvent(event, 102, { team: 'Синие' })
  joinEvent(event, 103, { team: 'Неизвестные' })

  assertEqual(event.participantTeamByVkId.get(101), 'Красные', 'joinEvent нормализует команду')
  assertEqual(event.participantTeamByVkId.get(102), 'Синие', 'joinEvent сохраняет известную команду')
  assertEqual(event.participantTeamByVkId.has(103), false, 'joinEvent игнорирует неизвестную команду')
  assertDeepEqual(event.queueOrder, [103], 'переполнение лимита идёт в очередь')
}

function main() {
  runParseTests()
  runIndexTests()
  runJoinTests()
  console.log('OK: team-mode selftest passed')
}

main()

