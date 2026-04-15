import {
  matchAddByNameCommand,
  matchTeamSlotCommand,
  parseAddByNameBody,
  parsePayRosterCommand,
  parseRemoveRosterCommand,
  parseUnpayRosterCommand,
} from '../src/parsers/adminChatCommands.js'

function assertEqual(actual, expected, title) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${title}: expected=${e} actual=${a}`)
  }
}

function assertNull(value, title) {
  if (value != null) {
    throw new Error(`${title}: expected null actual=${JSON.stringify(value)}`)
  }
}

function runPayUnpayRemove() {
  assertEqual(parsePayRosterCommand('p3'), { mode: 'global', number: '3' }, 'p глобальный')
  assertEqual(parsePayRosterCommand('P  Красные  2'), { mode: 'team', teamRaw: 'Красные', number: '2' }, 'p с командой и пробелами')

  assertEqual(parseUnpayRosterCommand('up12'), { mode: 'global', number: '12' }, 'up глобальный')
  assertEqual(parseUnpayRosterCommand('up синие 1'), { mode: 'team', teamRaw: 'синие', number: '1' }, 'up с командой')

  assertEqual(parseRemoveRosterCommand('r5'), { mode: 'global', number: '5' }, 'r глобальный')
  assertEqual(parseRemoveRosterCommand('r без команды 2'), { mode: 'team', teamRaw: 'без команды', number: '2' }, 'r без команды')

  assertNull(parsePayRosterCommand('p'), 'p без номера')
  assertNull(parsePayRosterCommand('p x'), 'p без цифр в конце')
}

function runAdd() {
  assertEqual(matchAddByNameCommand('+add Вася'), { body: 'Вася' }, '+add матч')
  assertNull(matchAddByNameCommand('add Вася'), '+add без плюса')

  const slots = ['Красные', 'Синие']
  assertEqual(parseAddByNameBody('Вася', slots), { playerName: 'Вася' }, 'одно слово без команды')
  assertEqual(parseAddByNameBody('Вася Красные', slots), { playerName: 'Вася', team: 'Красные' }, 'имя + команда')
  assertEqual(parseAddByNameBody('Вася Пупкин красные', slots), { playerName: 'Вася Пупкин', team: 'Красные' }, 'регистр команды')
}

function runTeam() {
  const m = matchTeamSlotCommand('+team  A,  B , a ')
  assertEqual(m.teamNames, ['A', 'B'], '+team дедуп и нормализация')
  assertNull(matchTeamSlotCommand('+team'), '+team без аргументов')
}

function main() {
  runPayUnpayRemove()
  runAdd()
  runTeam()
  console.log('OK: admin-commands selftest passed')
}

main()
