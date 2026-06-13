import { parseTeamSlotNames, findTeamSlotLabel } from '../src/parsers/startCommand.js'
import { getUserIdByTeamIndex } from '../src/handlers/commands/indexByNumber.js'
import { joinEvent, leaveEvent, setTeamLimit } from '../src/services/roster.js'
import { applySiteRosterToEvent } from '../src/services/applySiteRosterToEvent.js'

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

function makeTeamEvent(teamSlots) {
  return {
    maxPlayers: 20,
    teamSlots,
    participants: new Set(),
    participantsOrder: [],
    queue: new Set(),
    queueOrder: [],
    rosterOrder: [],
    teamLimits: new Map(),
    paidParticipants: new Set(),
    participantTeamByVkId: new Map(),
    siteSyncGraceUntilByVkId: new Map(),
  }
}

function runJoinTests() {
  const event = makeTeamEvent(['Красные', 'Синие'])

  joinEvent(event, 101, { team: '  кРАСНЫЕ ' })
  joinEvent(event, 102, { team: 'Синие' })
  joinEvent(event, 103, { team: 'Неизвестные' }) // нет такой команды → «Без команды»

  assertEqual(event.participantTeamByVkId.get(101), 'Красные', 'joinEvent нормализует команду')
  assertEqual(event.participantTeamByVkId.get(102), 'Синие', 'joinEvent сохраняет известную команду')
  assertEqual(event.participantTeamByVkId.has(103), false, 'joinEvent игнорирует неизвестную команду')
  // Без явных лимитов (дефолт на команду) никто не переполняет — очередь пуста.
  assertDeepEqual(event.queueOrder, [], 'без лимитов очередь пуста')
  assertEqual(event.participants.has(103), true, 'без команды всегда в основе')
}

function runTeamLimitTests() {
  const event = makeTeamEvent(['Красные', 'Синие'])
  setTeamLimit(event, 'Красные', 1)

  joinEvent(event, 201, { team: 'Красные' }) // основа Красных (1/1)
  joinEvent(event, 202, { team: 'Красные' }) // переполнение Красных → очередь Красных
  joinEvent(event, 203, { team: 'Синие' }) // основа Синих

  assertDeepEqual(event.participantsOrder, [201, 203], 'основа разбита по лимитам команд')
  assertDeepEqual(event.queueOrder, [202], 'переполнение команды идёт в её очередь')

  // Выход из основы команды поднимает игрока из очереди ТОЙ ЖЕ команды.
  const res = leaveEvent(event, 201)
  assertDeepEqual(res.promoted, [202], 'из очереди команды поднимается её игрок')
  assertEqual(event.participants.has(202), true, '202 поднят в основу')
  assertDeepEqual(event.queueOrder, [], 'очередь команды опустела')
}

function runSwitchTests() {
  const event = makeTeamEvent(['Красные', 'Синие'])
  joinEvent(event, 301, { team: 'Красные' })

  const res = joinEvent(event, 301, { team: 'Синие' }) // нажал другую команду → переход
  assertEqual(res.switched, true, 'нажатие другой команды переводит игрока')
  assertEqual(event.participantTeamByVkId.get(301), 'Синие', 'команда сменилась на Синие')

  const res2 = joinEvent(event, 301, { team: 'Синие' }) // своя команда → без изменений
  assertEqual(res2.status, 'noop', 'своя команда — без изменений')
  assertEqual(Boolean(res2.switched), false, 'своя команда не считается переходом')
}

function runSiteTeamChangeTests() {
  // Турнирный режим (place='tr'), команда «Красные» с лимитом 1.
  const event = { ...makeTeamEvent(['Красные', 'Синие']), place: 'tr' }
  const slots = ['Красные', 'Синие']
  const limits = { красные: 1 }

  // Снимок 1: p2 в Красных (основа), p1 и p3 в Синих.
  applySiteRosterToEvent(event, [1, 2, 3], [], { 1: 'Синие', 2: 'Красные', 3: 'Синие' }, slots, limits)
  assertDeepEqual(event.participantsOrder, [2, 1, 3], 'снимок 1: основа Красные(2) + Синие(1,3)')
  assertDeepEqual(event.queueOrder, [], 'снимок 1: очередь пуста')

  // Снимок 2: на сайте сменили p1 (Синие → Красные). Красные полны (лимит 1) →
  // p1 должен уйти в ХВОСТ очереди Красных, а p2 остаться в основе (не вытесняется).
  applySiteRosterToEvent(event, [1, 2, 3], [], { 1: 'Красные', 2: 'Красные', 3: 'Синие' }, slots, limits)
  assertDeepEqual(event.participantsOrder, [2, 3], 'смена команды не вытесняет основу')
  assertDeepEqual(event.queueOrder, [1], 'перешедший игрок встаёт в очередь новой команды')
}

function main() {
  runParseTests()
  runIndexTests()
  runJoinTests()
  runTeamLimitTests()
  runSwitchTests()
  runSiteTeamChangeTests()
  console.log('OK: team-mode selftest passed')
}

main()

